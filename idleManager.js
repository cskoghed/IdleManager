// ==UserScript==
// @name         Idle Manager
// @namespace    degod.IdleManager
// @version      0.0.0.2
// @updateURL    file://G:/My%20Drive/%E2%88%9E.1/Projekt/Userscripts/idleManager/src/idleManager.js
// @downloadURL  file://G:/My%20Drive/%E2%88%9E.1/Projekt/Userscripts/idleManager/src/idleManager.js
// @description  Useful information and tools for IDLE-PIXEL.com
// @author       You
// @match        https://idle-pixel.com/login/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=idle-pixel.com
// @grant        GM.xmlHttpRequest
// @run-at       document-end
// ==/UserScript==
"use strict";
// ----------------- Useful functions and abstractions -----------------

const helpers = {
    // Capitalize the first letter of each word in a string
    titleCase: str =>
        str
            .replaceAll("_", " ")
            .toLowerCase()
            .replace(/(?:^|\s|-)\w/g, match => match.toUpperCase()),

    // Sleep for a given amount of milliseconds
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
};

/**
 * Send a command to the game server
 * @param {string} cmd - The server command
 * @param {*} args - The command arguments
 *
 * @example // Add 2 big bones to the bonemeal bin
 * await sendServerCommand("ADD_BONEMEAL", "big_bones", 2); // => websocket.send("ADD_BONEMEAL=big_bones~2")
 *
 * @example // Switch to the 3rd combat preset
 * await sendServerCommand("PRESET_LOAD", 5, 1); // => websocket.send("PRESET_LOAD=5~1")
 *
 */
async function sendServerCommand(cmd, ...args) {
    if (args.length == 0) {
        return await websocket.send(cmd);
    }

    let message = cmd + "=" + args[0];
    for (let arg of args.slice(1, args.length)) {
        message += "~" + arg;
    }

    return await websocket.send(message);
}

/**
 * Wrapper function to retrieve item values from the game.
 * Used for easy upkeep of the script in case the game changes how item values are retrieved.
 * @param {string} item - The name of the item to get the value of, in lower snake case format.
 * @returns {string} The value of the item returned by the website.
 */
function getItem(item) {
    return Items.getItem(item);
}

function createToggleSwitch(className, func, ...args) {
    // Create elements
    var switchContainer = document.createElement("label");
    var input = document.createElement("input");
    var span = document.createElement("span");

    // Set attributes
    input.type = "checkbox";

    // Add static classes
    switchContainer.classList.add("switch");
    span.classList.add("slider");
    span.classList.add("round");

    // Add custom classes
    switchContainer.classList.add(className);
    span.classList.add(className);
    input.classList.add(className);

    // Append elements
    switchContainer.appendChild(input);
    switchContainer.appendChild(span);

    if (func) {
        switchContainer.onclick = e => {
            e.stopPropagation();
            func(...args);
        };
    } else {
        switchContainer.onclick = e => e.stopPropagation();
    }

    span.onclick = e => e.stopPropagation();

    return switchContainer;
}

// ----------------- Game classes -----------------

/**
 * @typedef {string} stringNum - A string of a number, may need to be converted using parseInt() or parseFloat() before using mathematic operators
 */

/**
 * @typedef {Object} RecipeIngredient
 * @property {Item} item - The item required.
 * @property {number} amount - The amount of the item required.
 */

/**
 * @typedef {Object} Recipe
 * @property {Array<RecipeIngredient>} ingredients - Ingredients required to produce some item.
 */

/**
 * Represents an item in the game.
 */
class Item {
    /**
     * @param {string} name - The name of the item.
     * @param {...Recipe} [recipes] - The possible recipes to produce the item.
     */
    constructor(name, recipes) {
        /**
         * The name of the item in snake_case format.
         * @type {string}
         */
        this.name = name.toLowerCase().replaceAll(" ", "_");
        /**
         * The possible recipes to produce the item.
         * @type {...Recipe}
         */
        this.recipes = recipes;
    }

    /**
     * A boolean representing whether the item is producible using `Item.recipes`.
     * @type {boolean}
     */
    get isProducible() {
        return this.recipes && this.recipes.length > 0;
    }

    /**
     * The total amount of the item in the game inventory.
     * @type {number}
     */
    get currentAmount() {
        return getItem(this.name); // window["var_" + this.name]
    }

    /**
     * The cost to produce the item, if possible.
     * @type {Promise<number>}
     */
    get productionCost() {
        // TODO: Gör om till en vanlig async metod istället för en getter
        if (!this.isProducible) {
            return undefined;
        }

        /**
         * Nested recursive function to accumulate the cost of recipes
         * @param {number} [      i = recipes.length -1] - Decreasing index variable to iterate over the recipes.
         * @param {number} [minCost = Infinity         ] - The minimum cost found so far.
         * @returns {Promise<number>} - The total cost of producing or buying all required recipes to produce the item.
         */
        function cheapestProductionCost(
            i = recipes.length - 1,
            minCost = Infinity
        ) {
            if (i == -1) {
                return Promise.resolve(Infinity);
            }

            return recipeCost(i - 1).then(totResourceCost =>
                recipes[i][0].cheapestPrice.then(
                    resourceCost =>
                        totResourceCost + resourceCost * recipes[i][1]
                )
            );
        }

        return cheapestProductionCost();
    }

    /**
     * The lowest cost available to retrieve the item.
     * @type {Promise<number>}
     */
    get cheapestPrice() {
        return this.productionCost();
    }
}

/**
 * Represents an item that can be traded on the in-game market.
 * @extends Item
 */
class TradableItem extends Item {
    /**
     * Fetches the latest data from the market.
     * @type {Promise<JSON>}
     */
    get marketData() {
    /* JSON Structure:
        [
            {
                market_id:                  int,
                market_item_amount:         int,
                market_item_category:       string,
                market_item_name:           string,
                market_item_post_timestamp: int,
                market_item_price_each:     int,
                player_id:                  int
            }
        ]
    */
        return fetch(`https://idle-pixel.com/market/browse/${this.name}`).then(
            response => response.json()
        );
    }

    /**
     * The lowest price found on the market, *before* applying the 1% sales tax.
     * @type {Promise<number>}
     */
    get lowestGrossPrice() {
        return this.marketData
            .then(data => data[0])
            .then(product => (product ? product.market_item_price_each : NaN));
    }

    /**
     * The lowest price found on the market, *after* applying the 1% sales tax.
     * @type {Promise<number>}
     */
    get lowestNetPrice() {
        return this.lowestGrossPrice.then(grossPrice =>
            Math.floor(grossPrice * 1.01)
        );
    }

    get cheapestPrice() {
        if (!this.isProducible) {
            return this.lowestNetPrice;
        }

        return this.productionCost.then(productionCost =>
            this.lowestNetPrice.then(marketCost =>
                marketCost
                    ? Math.min(productionCost, marketCost)
                    : productionCost
            )
        );
    }

    buy(amount = 1)
    {
        if (amount > 0) {
            websocket.send("MARKET_PURCHASE=" + this.marketData[0].market_id + "~" + amount);
        }
    }

    // constructor(name, recipes) {
    //     super(name, recipes);
    //     this.isTradable = true;
    // }
}

/**
 * Represents a bone in the game. Normally used to create bone meal.
 * @extends TradableItem
 */
class Bone extends TradableItem {
    /**
     * The amount of generated bonemeal when adding the bone to the bonemeal bin
     * @type {number}
     */
    get bonemeal() {
        return parseInt(
            document
                .querySelector("[data-item=" + this.name + "]")
                .getAttribute("data-bs-original-title")
                .match(/Bonemeal:\s*(\d+)/)[1]
        );
    }

    /**
     * Add `amount` bones of this type to the bonemeal bin.
     * @param {number} [amount = this.currentAmount] - The amount of bones to add. Defaults to the current amount available.
     */
    addToBin(amount = this.currentAmount) {
        // Make sure we're not adding zero bones to the bonemeal bin.
        if (!amount) {
            return;
        }

        websocket.send("ADD_BONEMEAL=" + this.name + "~" + amount);
    }
}

/**
 * Represents the bonemeal item in the game. Normally used to fertilize plants.
 * @extends Item
 */
class BoneMeal extends Item {
    //TODO: Implement the bonemeal class
}

// ------------------ Skill managers ------------------

class Manager {
    /**
     * The settings for the manager. Saved in the local storage.
     * @type {Object}
     */
    static settings = {};

    static get skill() {
        throw new Error("skill property is not implemented.");
    }

    /**
     * @type {boolean} Whether the toggle switch for the manager is checked.
     */
    static get isRunning() {
        return document.querySelector(
            `input[type='checkbox'][class='${this.skill}_toggle']`
        ).checked;
    }

    /**
     * Toggles the manager on or off.
     */
    static toggle() {
        this.isRunning ? this.start() : this.stop();
        Supervisor.saveSettings();
    }

    /**
     * Starts the manager, adds event listeners and observers.
     */
    static async start() {
        console.warn("start() method is not implemented.");
    }

    /**
     * Stops the manager, removes event listeners and observers.
     */
    static async stop() {
        console.warn("stop() method is not implemented.");
    }

}

class MiningManager extends Manager{
    static get skill() {
        return "mining";
    }

    /**
     * The expected time left of the rocket's current journey (in seconds)
     * @type {number}
     */
    static get rocketTimeLeft() {
        let rocketStatus = this.rocketStatus;
        let potionTimer = getItem('rocket_potion_timer');

        let distanceLeft = rocketStatus[0] === 't' ? // To or from planet?
            getItem('rocket_distance_required') - getItem('rocket_km') :
            getItem('rocket_km');
        let km_s = rocketStatus[rocketStatus.length -2] === 'u' ? // Sun or moon?
            300 : 1.5;

        // Add junk_planet_quest boost
        if (getItem('junk_planet_quest') == -1)
            km_s *= 2;

        // Add rocket_potion boost
        let unboostedTimeLeft = Math.floor(distanceLeft / km_s);
        if (potionTimer > 0) {
            // let unboostedTimeLeft = Math.floor(distanceLeft / km_s);
            let potionCoveredTime = Math.min(unboostedTimeLeft, potionTimer * 8);
            let uncoveredTime     = unboostedTimeLeft - potionCoveredTime;

            return {boosted: uncoveredTime + potionCoveredTime / 8, unboosted: unboostedTimeLeft};
        }
        return {boosted:unboostedTimeLeft, unboosted: unboostedTimeLeft};
    }

    /**
     * The current status of the rocket
     * @type {string}
     * @example "to_moon"
     * @example "from_sun"
     */
    static get rocketStatus() {
        return getItem('rocket_status');
    }

    static get totalMachineries() {
        return [
            "drill",
            "crusher",
            "giant_drill",
            "excavator",
            "giant_excavator",
            "massive_excavator"
        ].filter(machinery => getItem(machinery));
    }

    /**
     * UNFILTERED geodes, i.e. they may or may not be in the inventory.
     * @type {string[]}
     */
    static get geodeNames() {
        return [
            "xp_geode",
            "stone_geode",
            "grey_geode",
            "blue_geode",
            "green_geode",
            "red_geode",
            "cyan_geode",
            "ancient_geode"
        ];
    }

    static get prismNames() {
        return [
             "small_stardust_prism",
            "medium_stardust_prism",
             "large_stardust_prism"
        ]
    }

    static get mineralNames() {
        return Object.keys(Ores.MINERALS_XP_MAP);
    }

    /**
     * @type {{machine: string, numMachines: string}}
     */
    static get activeMachinery() {
        let result = {};
        this.totalMachineries.forEach(machine => {
            result[machine] = getItem(machine + '_on');
        });
        return result;
    }

    static start(){
        this.oilChange();

        if (!this.oilObserver)
            this.oilObserver = new MutationObserver(this.oilChange.bind(this));

        this.oilObserver.observe(document.querySelector('item-display[data-key=oil]'), { characterData: false, attributes: false, childList: true, subtree: false });


    }

    static stop(){
        if (this.oilObserver)
            this.oilObserver.disconnect();
    }

    static oilChange(){
        if (getItem('oil') == getItem('max_oil'))
            // TODO: Lös en mer elegenat lösning för att kolla settings alt. skapa alltid en tom om det inte finns.
            if (this.settings && this.settings.machinery && this.settings.currentPreset != undefined && this.settings.machinery[this.settings.currentPreset]){
                this.setMachineries(this.settings.machinery[this.settings.currentPreset]);
            }

    }

    static getOilCost(machine){
        return Ores.getOilCost(machine);
    }

    static crackAllGeodes(){
        for (let geode of this.geodeNames){
            const numGeodes = getItem(geode);
            if (numGeodes)
                this.crackGeode(geode, numGeodes);
        }
    }

    static openAllPrisms(){
        for(let prism of this.prismNames){
            const numPrisms = getItem(prism);
            if (numPrisms)
                this.openPrism(prism, numPrisms);
        }
    }

    static mineAllMeteors(){
        let numGeodes = getItem("meteor");
        for (; numGeodes > 0; numGeodes--){
            sendServerCommand("MINE_METEOR");
        }
    }

    static convertAllMinerals(){
        for (let mineral of this.mineralNames){
            const numMinerals = getItem(mineral);
            if (numMinerals){
                this.convertMineral(mineral, numMinerals);
            }
        }
    }

    /**
     * Cracks geodes, without checking availability in the inventory.
     * @param {string} geode - The geode to crack
     * @param {number} numGeodes - The number of geodes to crack
     */
    static crackGeode(geode, numGeodes){
        sendServerCommand("CRACK_GEODE", geode, numGeodes);
    }

    static openPrism(prism, numPrisms){
        sendServerCommand('SMASH_STARDUST_PRISM', prism, numPrisms);
    }

    static convertMineral(mineral, numMinerals){
        if (numMinerals > 0)
            sendServerCommand('MINERAL_XP', mineral, numMinerals);
    }

    static allowMessage(_, msgBody){
        return !this.isRunning || !(msgBody.startsWith("INFO~images/warning.png~Out of oil")); // - All machinery has been turned off.~false");
    }

    static runLoopIteration(){
        // Turn on machineries
        // if "OPEN_DIALOGUE=INFO~images/warning.png~Out of oil - All machinery has been turned off.~false"
        if (getItem('oil') === getItem('max_oil'))
            this.setMachineries(this.machineSettings)
    }

    static addSettingsBox(){
        // const xpPanel = document.querySelector('#panel-mining > .panel-logo-xp-area');
        const settingsBox = GUIManager.addBoxElemToPanel(this.skill);
            settingsBox.style.height = "13rem";

        let style = `

        .IdleManager-mining-presetContainer {
            background-color: rgba(0, 0, 0, 0.2);
            border-radius   : 5px;
            padding         : 5px;
            height          : 100%;
            width           : fit-content;
            min-width       : 20px;
            float           : left;
            user-select     : none;
            box-shadow      : 0 0 0;
            transition      : box-shadow 0.1s ease;

            &+.IdleManager-mining-presetContainer {
                margin-left:5px;
            }

            &.activePreset {
                border: thin solid grey;
            }

            &:hover {
                box-shadow: 0 0 0.5rem black;
            }

            tr {
                &.brtr {
                    height:100%;
                }

                td > img {
                    width : 20;
                    height: 20;
                }
            }
        }
        `;

        // -------------- Machinery presets --------------
        // TODO: Implement the actual preset-logic for the settings.
        for (let presetNum = 0; presetNum < 5; presetNum++){
            const preset = document.createElement('table');
            preset.classList.add('IdleManager-mining-settingsPreset');
            // preset.id = "IdleManager-mining-settingsPreset-"+ presetNum;
            preset.presetNum = presetNum;

            const presetContainer = document.createElement('div');
                presetContainer.classList.add('IdleManager-mining-presetContainer');
                presetContainer.appendChild(preset);
                presetContainer.oncontextmenu = e => {
                    const shouldSave = confirm("Do you want to store the current machineries as a preset?");
                    if (shouldSave){
                        MiningManager.settings.currentPreset = presetNum;
                        document.querySelectorAll('.IdleManager-mining-presetContainer.activePreset').forEach(p => p.classList.remove('activePreset'))
                        presetContainer.classList.add('activePreset');
                        MiningManager.saveMachineSettings();
                    }

                    e.preventDefault();
                }
                presetContainer.onclick = e => {
                    if (!MiningManager.settings.machinery[presetNum]){
                        alert("Right click to save current machineries as a preset. Left click to activate preset.");
                        return;
                    }

                    if (presetContainer.classList.contains('activePreset')){
                        console.log(Object.keys(MiningManager.activeMachinery).toString(), Object.keys(MiningManager.settings.machinery[presetNum]).toString());
                        if (Object.values(MiningManager.activeMachinery).toString() == Object.values(MiningManager.settings.machinery[presetNum]).toString())
                            MiningManager.turnOfMachineries();
                        else
                            MiningManager.setMachineries(MiningManager.settings.machinery[presetNum]);
                    }
                    else {
                        MiningManager.settings.currentPreset = presetNum;
                        MiningManager.setMachineries(MiningManager.settings.machinery[presetNum]);
                        document.querySelectorAll('.IdleManager-mining-presetContainer.activePreset').forEach(p => p.classList.remove('activePreset'))

                        // document.querySelector('.IdleManager-mining-presetContainer.activePreset').classList.remove('activePreset');
                        presetContainer.classList.add('activePreset');
                    }
                }

            settingsBox.appendChild(presetContainer);
        }



        // ------------- Quick-action buttons -------------
        const ul = settingsBox.querySelector('.IdleManager-multi-action-container > ul');

        // Mine-all-meteors button
        const meteorBtn = document.createElement('button');
            meteorBtn.className = "IdleManager-multi-action meteorBtn";
            meteorBtn.style.backgroundImage = "url(https://d1xsc8x7nc5q8t.cloudfront.net/images/meteor.png)";
            meteorBtn.onclick = this.mineAllMeteors.bind(this);
            meteorBtn.onmouseenter = e => {
                const numMeteors = getItem("meteor");
                meteorBtn.title = numMeteors ? `Mine ${numMeteors} meteor.` : "No meteors to open.";
            }
        const meteorLi = document.createElement('li');
            meteorLi.appendChild(meteorBtn);
            ul.appendChild(meteorLi);
        // Crack-all-geodes button
        const geodeBtn = document.createElement('button');
            geodeBtn.className = "IdleManager-multi-action geodeBtn";
            geodeBtn.style.backgroundImage = "url(https://d1xsc8x7nc5q8t.cloudfront.net/images/grey_geode.png)";
            geodeBtn.onclick = this.crackAllGeodes.bind(this);
            geodeBtn.onmouseenter = e => {
                let geodeInfo = [];
                for (let geode of MiningManager.geodeNames){
                    const numGeodes = getItem(geode);
                    if (numGeodes)
                        geodeInfo.push(numGeodes + ' ' + Items.get_pretty_item_name(geode.slice(0, -6)));
                }
                geodeBtn.title = geodeInfo.length ? `Crack ${geodeInfo.join(', ')} geodes.` : "No geodes to crack.";
            }
        const geodeLi = document.createElement('li');
            geodeLi.appendChild(geodeBtn);
            ul.appendChild(geodeLi);
        // Open-all-prisms button
        const prismBtn = document.createElement('button');
            prismBtn.className = "IdleManager-multi-action prismBtn";
            prismBtn.style.backgroundImage = "url(https://d1xsc8x7nc5q8t.cloudfront.net/images/small_stardust_prism.png)";
            prismBtn.onclick = this.openAllPrisms.bind(this);
            prismBtn.onmouseenter = e => {
                let prismInfo = [];
                for (let prism of MiningManager.prismNames){
                    const numPrisms = getItem(prism);
                    if (numPrisms)
                        prismInfo.push(numPrisms + ' ' + Items.get_pretty_item_name(prism.slice(0, -6)));
                }
                prismBtn.title = prismInfo.length ? `Open ${prismInfo.join(`, `)} prisms.` : "No prisms to open.";
            }
        const prismLi = document.createElement('li');
            prismLi.appendChild(prismBtn);
            ul.appendChild(prismLi);

        // Convert-all-minerals button
        const mineralBtn = document.createElement('button');
            mineralBtn.className = "IdleManager-multi-action mineralBtn";
            mineralBtn.style.backgroundImage = "url(https://d1xsc8x7nc5q8t.cloudfront.net/images/blue_marble_mineral.png)";
            mineralBtn.onclick = this.convertAllMinerals.bind(this);
            mineralBtn.onmouseenter = e => {
                let mineralInfo = [];
                for (let mineral of MiningManager.mineralNames){
                    const numMinerals = getItem(mineral);
                    if (numMinerals > 0)
                        mineralInfo.push((numMinerals) + ' ' + Items.get_pretty_item_name(mineral.slice(0, -8)));
                }
                mineralBtn.title = mineralInfo.length ? `Convert ${mineralInfo.join(`, `)} minerals.` : "No minerals to convert.";
            }
            // btnContainer.appendChild(mineralBtn);
        const mineralLi = document.createElement('li');
            mineralLi.appendChild(mineralBtn);
            ul.appendChild(mineralLi);

        // Append stylesheet
        const stylesheet = document.createElement('style');
              stylesheet.innerText = style;
        document.head.appendChild(stylesheet);
    }

    static turnOfMachineries(){
        // Turn all machineries off
        this.totalMachineries.forEach(machine => this.setMachinery(machine, 0));
    }

    static saveMachineSettings(){
        if (!MiningManager.settings.machinery){
            MiningManager.settings.machinery = [];

        }
        MiningManager.settings.machinery[MiningManager.settings.currentPreset] = MiningManager.activeMachinery;

        this.updatePresetBox();
        Supervisor.saveSettings();
    }

    static updatePresetBox(){
        if (!MiningManager.settings.machinery){
            MiningManager.settings.machinery = [];
            return;
        }


        // Update settings box element
        let presetNum = -1;
        // for (let presetBox of $('#panel-mining > .panel-logo-xp-area.dupe-box > div > .IdleManager-mining-settingsPreset')){
        for (let presetBox of document.getElementsByClassName('IdleManager-mining-settingsPreset')){
            presetNum++;
            let activePreset = MiningManager.settings.machinery[presetNum];

            if (!activePreset)
                continue;

            if (presetNum == MiningManager.settings.currentPreset)
                presetBox.parentNode.classList.add('activePreset');
            else
                presetBox.parentNode.classList.remove('activePreset');


            let oilConsumption = 0;

            presetBox.innerHTML = "";
            for (let [machine, numMachines] of Object.entries(activePreset)){
                if (!numMachines)
                    continue;
                let tr = document.createElement('tr');

                // Machine image
                let img = document.createElement('img');
                    img.src = GUIManager.getImage(machine);
                    img.draggable = false;
                let imageTd = document.createElement('td');
                    imageTd.appendChild(img);
                tr.appendChild(imageTd);

                // Machine amount
                let numTd = document.createElement('td');
                    numTd.innerHTML = numMachines;
                tr.appendChild(numTd);
                presetBox.appendChild(tr);

                oilConsumption += this.getOilCost(machine) * numMachines;
            }

            // Add oil consumption to preset box
            const brtr = document.createElement('tr');
                brtr.classList.add('brtr');
                presetBox.appendChild(brtr);

            const oilTr = document.createElement('tr');

            // Oil image
            const oilImgTd = document.createElement('td');
            const oilImg   = document.createElement('img');
                oilImg.src = GUIManager.getImage('oil');
                oilImg.draggable = false;
            oilImgTd.appendChild(oilImg);
            oilTr.appendChild(oilImgTd);

            // Oil amount
            const oilNumTd = document.createElement('td');
                oilNumTd.innerHTML = oilConsumption;
            oilTr.appendChild(oilNumTd);

            presetBox.appendChild(oilTr);

        }
    }

    /**
     * Sets multiple machines to the specified amounts
     * @param {{machine: string, numMachines: number}} machineSettings
     * @example setMachineries({
     * "drill": 2,
     * "giant_excavator": 1,
     * "crusher": 0
     * })
     */
    static setMachineries(machineSettings){
        let change = false;
        for (let [machine, numMachines] of Object.entries(machineSettings))
            change += this.setMachinery(machine, numMachines);
        if (change)
            Supervisor.saveSettings();
    }

    /*
     * Sets one machine to the specified amount
     * @param {{machine: string, numMachines: number}} machineSettings
     * @example setMachinery("drill", 2);
     * @returns {bool} Boolean signifying whether any change has been made or not.
     */
    static setMachinery(machine, numMachines){
        let currNumMachines = getItem(machine + '_on');

        if (currNumMachines == numMachines)
            return false;

        for (; currNumMachines > numMachines; currNumMachines--)
            this.decreaseMachinery(machine);

        for (; currNumMachines < numMachines; currNumMachines++)
            this.increaseMachinery(machine);

        return true;
    }

    static increaseMachinery(machine){
        sendServerCommand('MACHINERY', machine, 'increase');
    }

    static decreaseMachinery(machine){
        sendServerCommand('MACHINERY', machine, 'decrease');
    }

}

class WoodcuttingManager extends Manager {
    static get skill() {
        return "woodcutting";
    }

    static #loopInterval;

    static allowMessage(_, msgBody){
        return this.isRunning ? !msgBody.startsWith("none~none~images/woodcutting") : true;
    }

    static async start() {
        this.chopTrees();

        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
        }

        this.#loopInterval = setInterval(this.chopTrees.bind(this), 60000);
    }

    static async stop() {
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
            this.#loopInterval = null;
        }
    }

    static async chopTree(patchNum) {
        if (getItem("tree_timer_" + patchNum) == 1) {
            let tree = getItem("tree_" + patchNum);
            console.debug("Chopping " + tree + " in patch " + patchNum);
            await sendServerCommand("CHOP_TREE", patchNum);
        }
    }

    static async chopTrees() {
        let promiseArray = [];
        for (let i = 1; i < 6; i++) {
            promiseArray.push(this.chopTree(i));
        }

        await Promise.all(promiseArray);
    }
}

class CookingManager extends Manager {
    static get skill() {
        return "cooking";
    }

    static get recipes() {
        return Array.from(
            document.querySelectorAll(`tr[data-cooks_book-item]`)
        ).map(x => x.getAttribute("data-cooks_book-item"));
    }

    // TODO: Fixa så att den här baseras på vad som är markerad istället
    static get foodToPrepare() {
        return "golden_apple"; // "banana_jello";
    }

    static #cooksBookObserver;

    static async start() {
        this.prepareFood();
        if (this.#cooksBookObserver) {
            this.#cooksBookObserver.disconnect();
        }
        this.#cooksBookObserver = new MutationObserver(
            this.prepareFood.bind(this)
        );
        const config = { childList: true, subtree: true };

        const cooksBookElem = document.getElementById("cooks-book-item-status");

        this.#cooksBookObserver.observe(cooksBookElem, config);
        console.debug("Observing cooks book.");
    }

    static async stop() {
        if (this.#cooksBookObserver) {
            this.#cooksBookObserver.disconnect();
        }
    }

    static async prepareFood() {
        this.collectCooksBook();
        if (CooksBook.isIdle) {
            console.debug("Preparing food: " + this.foodToPrepare);
            await sendServerCommand("COOKS_BOOK", this.foodToPrepare);
        }
    }

    static async collectCooksBook() {
        if (CooksBook.isCollectable) {
            console.debug("Collecting Cooks Book");
            await sendServerCommand("COOKS_BOOK_READY");
        }
    }
}

class FishingManager extends Manager {
    static get skill() {
        return "fishing";
    }
    static #loopInterval;

    static start() {
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
        }
        console.debug("Starting Fishing manager");

        this.sendBoats();
        // this.feedFish();

        this.#loopInterval = setInterval(() => {
            this.sendBoats();
            // this.feedFish();
        }, 60000);
    }

    static stop() {
        console.debug("Stopping Fishing manager");
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
        }
    }

    /**
     * @inheritdoc Manager.#boats
     */
    static get boats() {
        return this.#boats;
    }

    /**
     * @inheritdoc Manager.#boats
     */
    static get bait() {
        return this.#bait;
    }

    static get numBoatsOutAtSea() {
        let numBoats = 0;
        for (let i = 0; i < this.boats.length; ++i) {
            const boatStatus = new BoatStatus(this.boats[i]);
            if (boatStatus.isOutAtSea) {
                ++numBoats;
            }
        }
        return numBoats;
    }

    static get maxBoatsOutAtSea() {
        if ( getItem("criptoe_path_perm_sea") && (getItem("researcher_points") >= 2e8) ) {
            // Sea criptoe path at 200 million researcher points allows all boats
            return this.boats.length;
        }
        if (getItem("boating_dock")) {
            // Boating dock allows 2 boats
            return 2;
        }

        return 1;

        // return max(
        //     // Boating dock allows 2 boats
        //     getItem("boating_dock") ? 2 : 1,
        //     // Sea criptoe path at 200 million researcher points allows all boats
        //     ( getItem("criptoe_path_perm_sea") && (getItem("researcher_points") >= 2e8) ) ? this.boats.length : 1
        // );
    }

    static async sendBoats() {
        // TODO: Fixa så att den här skickar båtarna som är markerade istället för bara de 2 första
        // console.debug("Sending boats...");

        for (let i = 0, sent = 0; i < this.boats.length && sent < this.maxBoatsOutAtSea; ++i) {
            const boatStatus = this.sendBoat(this.boats[i]);
            if (boatStatus.isOutAtSea) {
                ++sent;
            }
        }
    }

    /**
     * Sends `boat` out to sea, unless it's already there.
     * @param {string} boat - The name of the boat to send
     * @returns {BoatStatus} - The status after attempting to send the boat
     */
    static async sendBoat(boat) {
        const boatStatus = new BoatStatus(boat);
        await this.#sendBoat(boatStatus);

        return boatStatus;
    }

    /**
     * Collects all collectable boats.
     */
    static async collectBoats() {
        const promises = [];
        // Collect boats concurrently
        for (let boat of this.boats) {
            promises.push(this.#collectBoat(new BoatStatus(boat)));
        }

        // Wait for all boats to be collected
        await Promise.all(promises);
    }

    static async feedFish() {
        const aquariumStatus = new AquariumStatus();

        for (let bait of this.bait) {
            this.#feedFish(aquariumStatus, bait);
            await helpers.sleep(1000);

            if (aquariumStatus.isFed) {
                break;
            }
        }

        return aquariumStatus;
    }

    /**
     * An array of the boats available in the game, in snake case format.
     * @type {Array<string>}
     */
    static #boats = [
        "submarine_boat",
        // "pirate_ship",
        "stardust_boat",
        "canoe_boat",
        "row_boat",
    ];

    /**
     * An array of the bait available in the game, in snake case format.
     * @type {Array<string>}
     */
    static #bait = ["mega_bait", "super__bait", "bait", "maggots"];

    /**
     * Collects the boat and updates it's status, if it's collectable.
     * @param {BoatStatus} boat - The status of the boat
     */
    static async #collectBoat(boat) {
        if (boat.isCollectable) {
            console.debug("Collecting boat: " + boat.boat);
            sendServerCommand("BOAT_COLLECT", boat.boat);
            boat.timer = 0;
        }
    }

    /**
     * Sends a boat out to sea and updates it's status, unless it's out at sea already.
     * @param {BoatStatus} boat - The status of the boat
     */
    static async #sendBoat(boat) {
        this.#collectBoat(boat); // Try to collect the boat at first

        if (boat.isSendable) {
            console.debug("Sending boat: " + boat.boat);
            await sendServerCommand("BOAT_SEND", boat.boat);
            boat.timer = 10; // Set the timer to >1 to indicate that the boat is out at sea
        }
    }

    /**
     * Feeds the fish in the aquarium, if they are hungry and the bait is available.
     * @param {AquariumStatus} aquariumStatus - The status of the aquarium
     * @param {string} bait - The bait to feed the fish
     */
    static async #feedFish(aquariumStatus, bait) {
        if (aquariumStatus.isHungry && (getItem(bait) > 0)) {
            console.debug("Feeding fish " + bait);
            sendServerCommand("FEED_FISH", bait);
            // aquariumStatus.timer = 0; // Reset the timer after feeding
        }
    }
}

class FarmingManager extends Manager {
    static get skill() {
        return "farming";
    }

    static #loopInterval;

    /**
     * The seeds that the manager will attempt to plant. Should be set by the user.
     * @type {Array<string>}
     */
    static get seedsToPlant() {
        return ['red_mushroom_seeds', 'dotted_green_leaf_seeds', 'green_leaf_seeds', 'lime_leaf_seeds'];
    }

    /**
     * The seeds that the manager will attempt to add to the birdhouse. Should be set by the user.
     * @type {Array<string>}
     */
    static get seedsToPrepare() {
        return [
            0, // dotted_green_leaf_seeds
            0, // green_leaf_seeds
            0, // lime_leaf_seeds
            2, // red_mushroom_seeds
            0, // stardust_seeds
        ];
    }

    /**
     * The first seed in `seedsToPlant` that is available in the game inventory.
     */
    static get seedToPlant() {
        for (let seed of this.seedsToPlant)
            if (getItem(seed) > 0)
                return seed;
        return null;
    }

    static get farmingPatches() {
        return DonorShop.has_donor_active(getItem("donor_farm_patches_timestamp")) ? [1,2,3,4,5] : [1, 2, 3];
    }

    static get availableFarmingPatch() {
        return this.farmingPatches.filter(
            numStr => !getItem("farm_timer_" + numStr)
        )[0];
    }

    static getGrowthStage(patchNum){
        return parseInt(getItem("farm_stage_" + patchNum));
    }

    static allowMessage(_, msgBody){
        return this.isRunning ? !msgBody.startsWith("none~none~images/farming") : true;
    }

    static start() {
        console.debug("Starting Farming manager");
        this.plantSeeds();
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
        }
        this.#loopInterval = setInterval(() => {
            this.plantSeeds();
        }, 500);
    }

    static stop() {
        console.debug("Stopping Farming manager");
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
            this.#loopInterval = null;
        }
    }

    static async plantSeeds() {
        for (let patchNum of this.farmingPatches) {
            this.plantSeed(this.seedToPlant, patchNum);
        }
    }

    /**
     * Plants a seed if possible.
     * @param {string} seed - The seed to plant
     * @param {number} patchNum - The number of the farming patch
     */
    static plantSeed(seed, patchNum) {
        if (this.patchIsAvailable(patchNum) && getItem(seed))
            this.#plantSeed(seed, patchNum);
    }

    /**
     * Wrapper function for `harvestPatch()` to check if patch can be used for planting.
     * @param {number} patchNum - The patch to check
     * @returns {boolean} Whether the patch is available or not.
     */
    static patchIsAvailable(patchNum) {
        return !this.harvestPatch(patchNum);
    }

    /**
     * Harvests patch number `patchNum` if possible.
     * @param {number} patchNum - The number of the farming patch.
     * @returns {number} The updated growth stage of the patch: 0 if it's empty, else 1-3. Useful since the client side is not updated even though the server side is.
     */
    static harvestPatch(patchNum) {
        let growthStage = this.getGrowthStage(patchNum);
        if (growthStage != 4)
            return growthStage;

        this.#harvestPatch(patchNum);
        return 0;
    }

    /**
     * Sends server command to plant 'seed' in 'patchNum'.
     * @param {string} seed - The seed to plant
     * @param {stringNum} patchNum - The number of the farming patch
     */
    static async #plantSeed(seed, patchNum) {
        console.debug("Planting seed: " + seed + " in patch: " + patchNum);
        await sendServerCommand("PLANT", seed, patchNum);
    }

    /**
     * Sends server command to harvest patch `patchNum`
     * @param {number} patchNum - The number of the farming patch.
     */
    static async #harvestPatch(patchNum) {
        console.debug("Harvesting patch: " + patchNum);
        await sendServerCommand("CLICKS_PLOT", patchNum)
    }

    static async #prepareBirdhouse(
        dotted_green_leaf_seeds = 0,
        green_leaf_seeds = 0,
        lime_leaf_seeds = 0,
        red_mushroom_seeds = 0,
        stardust_seeds = 0
    ) {
        await sendServerCommand(
            "PREPARE_BIRDHOUSE=",
            dotted_green_leaf_seeds,
            green_leaf_seeds,
            lime_leaf_seeds,
            red_mushroom_seeds,
            stardust_seeds
        );
    }
}

class CombatManager extends Manager{
    static get skill(){
        return "woodcutting";
    }

    static get area(){
        return "blood_field";
    }

    static get shouldFarmMagic(){
        return true;
    }

    static get fightPoints(){
        return getItem('fight_points');
    }

    static get requiredFightPoints(){
        return {
            blood_field: 1000,
        };
    }

    static get rings(){
        return [
            "weak_defence_ring",
            "weak_damage_ring",
            "weak_accuracy_ring",
            "defence_ring",
            "damage_ring",
            "accuracy_ring",
            "good_defence_ring",
            "good_damage_ring",
            "good_accuracy_ring",
            "great_defence_ring",
            "great_damage_ring",
            "great_accuracy_ring",
            "perfect_defence_ring",
            "perfect_damage_ring",
            "perfect_accuracy_ring",
            "ancient_defence_ring",
            "ancient_damage_ring",
            "ancient_accuracy_ring",
            "master_ring",
          ];
    }

    static get unlockedRings(){
        return this.rings.filter(ring => getItem(ring));
    }

    static get equippedRings(){
        return this.rings.filter(ring => getItem(ring + '_equipped'));
    }

    static startFight(area){
        if (!area){
            area = this.area;
        }

        if (Item)

        sendServerCommand('START_FIGHT', area);
    }

    /**
     * Starts the manager, adds event listeners and observers.
     */
    static async start() {
        console.warn("start() method is not implemented.");
    }

    /**
     * Stops the manager, removes event listeners and observers.
     */
    static async stop() {
        console.warn("stop() method is not implemented.");
    }
}

class CriptoeManager extends Manager{
    // TODO: Gör klart!
    static async investCriptoe(){
        const percentages = await this.walletPercentages;
        const dayNum = new Date().getUTCDay();
        console.log(dayNum)

        // Sunday: Withdraw all
        if(dayNum == 7){
            for (let wallet = 1; wallet < 5; wallet++)
                this.withdraw(wallet);
        // Saturday: Withdraw all with better percentage than sunday penalty
        } else if (dayNum == 6){
            const sundayPenalty = -20;
            let wallet = 1;
            for (let percentage of percentages){
                if (percentage > sundayPenalty)
                    this.withdraw(wallet);
                wallet++;
            }
        // Monday-Friday: Withdraw from wallets that has performed better than `withdrawThreshold` and split among available wallets
        } else {
            // TODO:
            const withdrawThreshold = 30;

            let wallet = 1;
            for (let percentage of percentages){

            }
        }
    }

    static withdraw(wallet){
        sendServerCommand("CRIPTOE_WITHDRAWAL_WALLET", 'wallet_' + wallet);
    }


    // TODO: FIXA! - Den returnerar ingenting av någon anledning.
    /**
     * Fetches the current percentages for criptoe wallets.
     * Note that wallets are not indexed by their wallet ID's.
     * @async
     * @type {Promise<number[]>}
     */
    static get walletPercentages() {
        return this.walletData
        .then(data => data.slice(56))
        .then(wallets => wallets.map(
            (wallet, i) => {
                // Make sure nothing has changed with how the data is provided from the API
                console.assert(wallet.wallet == (i+1), "Wallet ID");
                console.assert(new Date(wallet.date).getDate() == new Date().getUTCDate(), "Wallet date");

                return wallet.percentage;
            }
        ));
    }

    /**
     * Fetches criptoe data
     * @async
     * @type {Promise<{wallet:number, percentage:number, date:string}>}
     */
    static get walletData() {
        return fetch("https://idle-pixel.com/criptoe").then(r => r.json()).then(json => json.data);
    }
}

class GatheringManager extends Manager{
    static get skill(){
        return "gathering";
    }

    static get lootAreas(){
        return [
            'mines',
            'fields',
            'forest',
            'fishing_pond',
            'kitchen',
            'gem_mine',
            'castle',
            'junk'
        ];
    }

    static openAllLoot(){
        for (let area of this.lootAreas){
            const numBags  = getItem('gathering_loot_bag_' + area);
            if (numBags)
                this.openLoot(area, numBags);
        }
    }

    static openLoot(area, numBags){
        sendServerCommand('OPEN_GATHERING_LOOT', area, numBags);
    }

    static addBoxElemToPanel(){
        const boxElem = GUIManager.addBoxElemToPanel(this.skill);
            boxElem.style.height = boxElem.style.minHeight;
        const actionList = boxElem.querySelector('.IdleManager-multi-action-container > ul');

        const li = document.createElement('li');
            actionList.appendChild(li);
        const openLootBtn = document.createElement('button');
            li.appendChild(openLootBtn);
            openLootBtn.className = "IdleManager-multi-action gatheringBtn";
            openLootBtn.style.backgroundImage = 'url(https://d1xsc8x7nc5q8t.cloudfront.net/images/gathering_loot_bag_mines.png)';
            openLootBtn.onclick = this.openAllLoot.bind(this);

    }
}


class BreedingManager extends Manager{
    static #loopInterval;
    static get skill()
    {
       return "breeding";
    }

    static get fightingAreas()
    {
       return {
          'fields': {
             fightpoints: 1,
          },
          'caves': {
             fightpoints: 2,
          },
          'volcano': {
             fightpoints: 4,
          },
          'beach': {
             fightpoints: 10,
          },
       };
    }
    static get inFight()
    {
        return parseInt(getItem('is_in_breeding_fight'));
    }

    static get fightpoints()
    {
        // return window.var_breeding_fight_points;
        return getItem('breeding_fight_points');
    }
    static #inAutoFight = false;


    static start()
    {
        console.debug("Starting Breeding manager");
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
        }

        this.#loopInterval = setInterval(() =>
        {
            if ( !this.inFight &&
                 !this.#inAutoFight &&
                 (this.fightpoints > 0) )
            {
                console.log("Starting breeding fight");
                this.autoFight('fields', false, false, true);
            }
        }, 1000);

    }

    static stop()
    {
        console.debug("Stopping Breeding manager");
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
            this.#loopInterval = null;
        }
    }



    /// The hp of opponents in ascending order
    static get opponents()
    {
       const opponentsArray = [];

       let i = 0;
       document.querySelectorAll('[id^=progress-bar-label-breeding-monster-hp-left-]')
          .forEach(e =>
       {
          const hp = parseInt(e.textContent);
          opponentsArray.push(hp);
       });

       opponentsArray.sort((a, b) => a - b);

       return opponentsArray;
    }

    static get weakestOpponent()
    {
       let weakest = 0;
       let weakestHP = 9999;

       let i = 0;
       document.querySelectorAll('[id^=progress-bar-label-breeding-monster-hp-left-]')
          .forEach(e =>
       {
          const hp = parseInt(e.textContent);
          if (hp > 0 && hp < weakestHP)
          {
             weakest = i;
             weakestHP = hp;
          }
          ++i;
       });

       return weakest;
    }





    static currentTarget = [NaN, NaN, NaN, NaN, NaN];

    /*
     * @param {string} area
     * @param {bool} hardMonsters
     * @param {bool} veryHardMonsters
     * @param {bool} largePack
     */
    static startBreedingFight(area, hardMonsters, veryHardMonsters, largePack)
    {
       area = area.toLowerCase();

       if (!this.fightingAreas[area]){
          console.error(`No area named '${area}'`)
          return false;
       }

       if (this.fightpoints < this.fightingAreas[area].fightpoints){
          console.error(`Too few fightpoints: ${this.fightpoints} / ${this.fightingAreas[area].fightpoints}`)
          return false;
       }

       if (this.inFight){
          console.error("Already in fight");
          return false;
       }

       hardMonsters *= 1;
       veryHardMonsters *= 1;
       largePack *= 1;
       websocket.send(`START_BREEDING_FIGHT_AREA=${area}~${hardMonsters}~${veryHardMonsters}~${largePack}`)
       return true;
    }

    /*
     * @param {int} attacker
     * @param {int} target
     */
    static setTarget(attacker, target)
    {
       websocket.send(`BREEDING_FIGHT_SET_TARGET=${attacker}~${target}`)
    }

    /*
     * @param {int} attacker
     * @param {int} target
     */
    static usePeck(attacker, target)
    {
       const stamina         = parseInt(document.getElementById(`progress-bar-label-breeding-stamina-at-${attacker}`).textContent);
       const requiredStamina = parseInt(document.getElementById(`progress-bar-label-breeding-stamina-req-${attacker}`).textContent);
       if (stamina == requiredStamina){
          websocket.send(`BREEDING_FIGHT_USE_STAMINA=${attacker}~${target}`);
       }
    }

    /*
     * @param{int} target
     */
    static setAllTargets(target)
    {
       let attacker = 0;
       document.querySelectorAll('[id^=progress-bar-label-breeding-hp-left-]')
          .forEach(e =>
       {
          let hp = parseInt(e.textContent);
          if (hp > 0)
          {
             if (this.currentTarget[attacker] != target)
             {
                this.currentTarget[attacker] = target;
                this.setTarget(attacker, target);
             }
             this.usePeck(attacker, target);
          }
          ++attacker;
       })

    }

    ///TODO: Funkar inte
    static async smartSetAllTargets()
    {
       // return new Promise(resolve =>
       // {
          let attacks = [0, 0, 0, 0, 0, 0, 0, 0];
          let attacker = 0;
          const HPels = document.querySelectorAll('[id^=progress-bar-label-breeding-hp-left-]');
          for (const e of HPels)
          {
             let targets = this.opponents;

             let hp = parseInt(e.textContent);
             if (hp > 0){
                let target = 0;
                while (targets[target] <= 0){
                   ++target;
                }

                if (targets[target] - attacks[target] * 4 < 0)
                {
                   await new Promise(r => setTimeout(r, 1000));
                }

                targets = this.opponents;
                attacks = [0, 0, 0, 0, 0, 0, 0, 0];

                target = 0;
                while (targets[target] <= 0){
                   ++target;
                }

                this.setTarget(attacker, target);
                this.usePeck(attacker, target);
                ++attacks[target];

             }
             ++attacker;
          }
       //    resolve('jippie!');
       // });

    }




    static async autoTarget()
    {
       return await new Promise(resolve =>
       {
          const interval = setInterval(() =>
          {
             if (!this.inFight)
             {
                console.log("Fight Ended.");
                resolve('Fight Ended.')
                this.currentTarget = [NaN, NaN, NaN, NaN, NaN];
                clearInterval(interval);
             } else
                this.setAllTargets(this.weakestOpponent);
          }, 1000);
       })


    }

    static async autoFight(area, hardMonsters, veryHardMonsters, largePack)
    {
        let startedFight;
        this.#inAutoFight = true;
        do {
            startedFight = this.startBreedingFight(area, hardMonsters, veryHardMonsters, largePack);
            await this.autoTarget();
        } while (startedFight)
        console.log("Done fighting.")
        this.#inAutoFight = false;

    }
 }

class MarketManager extends Manager{
    static get skill()
    {
        return "player-market";
    }

    static #loopInterval;


    static settings =
    {
        shoppingList:
        [
            {
                item: new TradableItem("dotted_green_leaf_seeds"),
                amount: 0,
                price: 3500
            },

            {
                item: new TradableItem("green_leaf_seeds"),
                amount: 1,
                price: 40000
            }
        ]
    };

    static tryBuy(shoppingList)
    {
        for (let entry of shoppingList) {
            if (entry.amount > 0)
            {
                const item = entry.item;
                if (item.lowestNetPrice <= entry.price)
                {
                    console.debug(`Buying ${item.name} for ${entry.price}`);
                    // sendServerCommand("BUY_ITEM", item.name, entry.amount);
                    item.buy(entry.amount);
                }
            }
        }
    }

    /**
     * Starts the manager, adds event listeners and observers.
     */
    static async start()
    {
        console.debug("Starting Market manager");
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
        }

        this.#loopInterval = setInterval(() => {
            this.tryBuy(this.settings.shoppingList);
        }, 1000);
    }

    /**
     * Stops the manager, removes event listeners and observers.
     */
    static async stop()
    {
        console.debug("Stopping Market manager");
        if (this.#loopInterval) {
            clearInterval(this.#loopInterval);
        }
    }
}

// ----------------- Supervisors -----------------
class Supervisor {
    static marketData;

    static get managers() {
        return [
            MiningManager,
            FarmingManager,
            WoodcuttingManager,
            CookingManager,
            FishingManager,
            BreedingManager,
            MarketManager,
        ];
    }

    static get username() {
        return getItem('username');
    }

    static closeModals() {
        for (let modal of document.getElementsByClassName(
            "modal modal-dim show"
        )) {
            // Modals.toggle(modal.id);
            $(modal).modal('hide');
        }
    }

    static async updateMarketData(){
        this.marketData = await fetch('https://idle-pixel.com/market/browse/all').then(response => response.json());
    }

    static initializeGUI() {
        this.updateMarketData(); // Perhaps unnecessary?

        // Add styling for custom toggleSwitches
        GUIManager.styleToggleSwitches();

        // Add buttons to sidebar
        GUIManager.addMenuBarButtons();

        // Add search bar for idle-wiki
        GUIManager.addWikiSearch();

        // Market UI
        GUIManager.improveMarketUI.initialize();

        // Add handler for websocket on_message()
        this.addMessageHandler();

        // Mining
        {
            // Fix rocket notification
            GUIManager.notifications.rocket.showTime();

            let ogMiningOnclick = document.getElementById('left-panel-item_panel-mining').onclick;

            // Add new element to mining panel by rebinding the first call to the onclick function
            // Required since the elements get weird sizes if the panel hasn't been clicked.
            document.getElementById('left-panel-item_panel-mining').onclick = e => {
                ogMiningOnclick(e);

                // Bind it back to the og onclick function
                document.getElementById('left-panel-item_panel-mining').onclick = ogMiningOnclick;

                MiningManager.addSettingsBox();
                MiningManager.updatePresetBox();

                const rocketItemBox = document.querySelector('itembox[data-item=mega_rocket]');
                rocketItemBox.onmouseenter = () => {
                    rocketItemBox.title = `Moon: ${format_number(getItem('moon_distance'))} km\nSun: ${format_number(getItem('sun_distance'))} km`;
                }
            }
        }

        // Gathering

        let ogGatheringOnclick = document.getElementById('left-panel-item_panel-gathering').onclick;

            // Add new element to gathering panel by rebinding the first call to the onclick function
            // Required since the elements get weird sizes if the panel hasn't been clicked.
            document.getElementById('left-panel-item_panel-gathering').onclick = e => {
                ogGatheringOnclick(e);

                // Bind it back to the og onclick function
                document.getElementById('left-panel-item_panel-gathering').onclick = ogGatheringOnclick;

                GatheringManager.addBoxElemToPanel();
            }
    }

    static addMessageHandler() {
        let oldOnmessage = websocket.connected_socket.onmessage;
        websocket.connected_socket.onmessage = event => {
            let [msgHead, msgBody] = event.data.split('=');
            if (!msgBody || (
                FarmingManager    .allowMessage(msgHead, msgBody) &&
                WoodcuttingManager.allowMessage(msgHead, msgBody) &&
                MiningManager     .allowMessage(msgHead, msgBody)
            )) oldOnmessage.call(this, event);
        }
    }

    static saveSettings() {
        let settings = {};
        this.managers.forEach(manager => {
            settings[manager.skill] = {
                turnedOn: manager.isRunning,
                settings: manager.settings
            }
        });
        localStorage.setItem(`IdleManager-${this.username}`, JSON.stringify(settings));

        console.groupCollapsed("Saved settings:");
        console.log(settings.mining.settings);
        console.groupEnd();
    }

    static loadSettings() {
        let storedSettings = JSON.parse(localStorage.getItem(`IdleManager-${this.username}`));
        if (!storedSettings)
            return;
        for (let manager of this.managers) {
            manager.settings = storedSettings[manager.skill].settings
            if (storedSettings[manager.skill] && storedSettings[manager.skill].turnedOn)
                document.getElementsByClassName(`switch ${manager.skill}_toggle`)[0].click();
        }
        console.group("Loaded settings:");
        console.table(storedSettings);
        console.groupEnd();
    }
}

class GUIManager {
    static improveMarketUI = {
        marketListingPlaceHolderRow: document.createElement("tr"),
        draggedListing: null,
        sellPrice: null,
        initialize: () => {
            // Rearrange items in market player listings
            let i = 1;
            [...document.getElementsByClassName('player-market-slot-base')].forEach(e => e.style.height = "520px");
            [...$('[id^=player-market-slot-occupied-]')].forEach(e => {
                e.style.position = "relative";
                e.innerHTML = `<h2 id="player-market-slot-item-item-label-${i}"></h2>
                        <!-- Reordered original listing info -->
                        <table style="margin-left:auto;margin-right:auto">
                            <tbody>
                                <tr>
                                    <td>
                                        <img id="player-market-slot-item-image-${i}">
                                    </td>

                                    <td>
                                        <div>
                                            <img src="https://d1xsc8x7nc5q8t.cloudfront.net/images/hashtag.png"> Amount left:
                                            <span id="player-market-slot-item-amount-left-${i}" class="color-grey"></span><br>

                                            <img src="https://d1xsc8x7nc5q8t.cloudfront.net/images/coins.png"> Price each:
                                            <span id="player-market-slot-item-price-each-${i}" class="color-grey"></span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- Custom market-listings table --->
                        <table id="table-market-slot-${i}" marketSlot=${i} style="margin: auto; text-align: right; padding: 10px;" ></table>

                        <!-- "Collect"/"Remove offer" buttons -->
                        <div style="position:absolute;left:0;right:0;bottom:5">
                            <hr>
                            <button id="player-market-slot-collect-amount-${i}" onclick="websocket.send('MARKET_COLLECT=${i}')" class="market-collect-button"><img src="https://d1xsc8x7nc5q8t.cloudfront.net/images/coins.png"></button>
                            <br>
                            <button onclick="websocket.send('MARKET_REMOVE_OFFER=${i}')" class="market-remove-button">Remove Offer</button>
                            <br>
                            Expires in: <span id="player-market-slot-expires-${i}">Hours</span>
                        </div>`;
                i++;
            })

            // Make sure each table gets updated upon market refresh
            let oldRefreshSlots = Market.refresh_slots;
            Market.refresh_slots = (data) => {
                Supervisor.updateMarketData().then(() => {
                    oldRefreshSlots.apply(null, [data]);
                    GUIManager.improveMarketUI.refreshSlots();
                });
            };
            // Pre-Refresh market data when hovering over player-market menu button
            document.getElementById('left-panel-item_panel-player-market').onmouseenter = () => websocket.send("MARKET_REFRESH_SLOTS");

            // this.marketListingPlaceHolderRow    = document.createElement("tr");
            GUIManager.improveMarketUI.marketListingPlaceHolderRow.id = "marketListingPlaceHolderRow";
            GUIManager.improveMarketUI.marketListingPlaceHolderRow.style.height = "30px";
            // GUIManager.improveMarketUI.marketListingPlaceHolderRow.style.border = "thin dashed gray";
            $('body')[0].appendChild(GUIManager.improveMarketUI.marketListingPlaceHolderRow);
        },

        refreshSlots: () => {
            for (let slot = 1; slot < 4; slot++){
                let coinImg = '<img src="https://d1xsc8x7nc5q8t.cloudfront.net/images/coins.png" draggable="false">';
                // let table = document.getElementById(`market-slot${slot}-table`);
                let table = document.getElementById(`table-market-slot-${slot}`);
                // let table = $(`table[marketSlot=${slot}]`);
                let item = document.getElementById(`player-market-slot-item-image-${slot}`).src.split('/').pop().split('.').shift();
                table.innerHTML = '<tbody><tr style="border-bottom: thin solid"><td style="width:40%"><b>Amount</b></td><td><b>Buy</b></td><td><b>Sell</b></td></tr></tbody>';

                let listingIndex = 0;
                Supervisor.marketData.forEach(listing => {
                    if (listing.market_item_name == item){
                        let row = table.insertRow();
                        row.listingIndex = listingIndex++;
                        if (listing.player_id == getItem('player_id')){
                            row.style.background = "rgba(0, 0, 0, 0.3)";
                            row.style.position = "relative";
                            row.draggable = "true";
                            row.id = `playerListing-${slot}`;
                            row.marketSlot = slot;
                            row.ondragstart = GUIManager.improveMarketUI.ondragstartlistingrow;
                            row.ondragend   = GUIManager.improveMarketUI.ondragendlistingrow;
                            row.ondragenter = () => $('body')[0].appendChild(GUIManager.improveMarketUI.marketListingPlaceHolderRow);
                        } else {
                            row.ondragover = GUIManager.improveMarketUI.ondragoverlistingrow;
                        }
                        let amountCell = row.insertCell();
                        amountCell.innerHTML = listing.market_item_amount;
                        let buyPriceCell = row.insertCell();
                        buyPriceCell.innerHTML = coinImg + format_number(Math.floor(listing.market_item_price_each * 1.01));
                        let sellPriceCell = row.insertCell();
                        sellPriceCell.innerHTML = coinImg + format_number(listing.market_item_price_each);
                    }
                });
            }
        },
        ondragoverlistingrow: e => {
            if (!GUIManager.improveMarketUI.draggedListing)
                return;

            let row = e.target;
            switch (row.tagName){
                case 'IMG':
                    row = row.parentNode;
                case 'TD':
                    row = row.parentNode;
                case 'TR':
                    break;
            }

            let tbody = row.parentNode;
            let marketSlot = tbody.parentNode.getAttribute('marketSlot');

            // Make sure the dragged item belongs to this table
            if (marketSlot != GUIManager.improveMarketUI.draggedListing.parentNode.parentNode.getAttribute('marketSlot'))
                return;

            let sellPrice;
            if (e.offsetY < 10){
                sellPrice = parseInt(row.children[2].textContent.replaceAll(',', '')) -1;
                $(GUIManager.improveMarketUI.marketListingPlaceHolderRow).insertBefore(row);

            }
            //  else if (row.nextSibling && row.nextSibling.children[2]){
            //     sellPrice = parseInt(row.nextSibling.children[2].textContent.replaceAll(',', '')) -1;
            //     $(GUIManager.improveMarketUI.marketListingPlaceHolderRow).insertAfter(row);
            // }

            if (sellPrice)
                document.getElementById('player-market-slot-item-price-each-' + marketSlot).innerHTML = format_number(sellPrice);
        },
        ondragleavelistingtable: e => {
        },
        ondragstartlistingrow: e => {
            GUIManager.improveMarketUI.draggedListing = e.target;
        },
        ondragendlistingrow: e => {
            if (parseInt(document.getElementById('player-market-slot-collect-amount-' + GUIManager.improveMarketUI.draggedListing.marketSlot).textContent.split(':')[1])){
                websocket.send('MARKET_COLLECT=' + GUIManager.improveMarketUI.draggedListing.marketSlot);
                Supervisor.closeModals();
            }
            websocket.send('MARKET_REMOVE_OFFER=' + GUIManager.improveMarketUI.draggedListing.marketSlot);

            let sellPrice = parseInt(document.getElementById('player-market-slot-item-price-each-' + GUIManager.improveMarketUI.draggedListing.marketSlot).textContent.replaceAll(',', ''));
            let item = document.getElementById(`player-market-slot-item-image-${GUIManager.improveMarketUI.draggedListing.marketSlot}`).src.split('/').pop().split('.').shift();
            let amount = parseInt(document.getElementById('player-market-slot-item-amount-left-' + GUIManager.improveMarketUI.draggedListing.marketSlot).textContent.replaceAll(',', ''));

            websocket.send("MARKET_POST=" + GUIManager.improveMarketUI.draggedListing.marketSlot + "~" + item + "~" + amount + "~" + sellPrice);
            $('body')[0].appendChild(GUIManager.improveMarketUI.marketListingPlaceHolderRow);
            GUIManager.improveMarketUI.draggedListing = null;
            switch_panels('panel-player-market');
        }
    }

    static notifications = {
        rocket: {
            showTime: () => {
                // for (let rocketType of ["rocket", "mega_rocket"]) {
                    // + "/" + format_number(Items.getItem("rocket_distance_required"))
                let rocketType = "rocket";
                let oldRocketNotification = `document.getElementById('notification-${rocketType}-label').innerHTML = format_number(value)`;
                let newRocketNotification = `
                let rocketTimeLeft = MiningManager.rocketTimeLeft;
                let potionPercent = Math.min(100, Math.floor(100 * getItem('rocket_potion_timer') * 8/ (rocketTimeLeft.unboosted)));
                ${oldRocketNotification} + " (" + format_time(rocketTimeLeft.boosted) + ")";
                document.getElementById('notification-${rocketType}').style.background = 'linear-gradient(90deg, rgb(121,9,9) '+ potionPercent +'%, rgb(0, 76, 78) '+ (potionPercent) +'%, rgb(0, 76, 78) 100%)'`

                let oldAction = Items.action.toString().slice(24); // slice(24) removes the function header, which is needed for eval to function correctly
                let newAction = "Items.action = (key, value) => " + oldAction.replaceAll(oldRocketNotification, newRocketNotification);

                eval(newAction);
            }
        }
    }

    static addBoxElemToPanel(skill){
        const style = `
        div.IdleManager-multi-action-container {
            float          : right;
            width          : auto;
            height         : 100%;
            display        : flex;
            justify-content: center;
            align-items    : center;

            ul {
                list-style-type: none;
                margin-bottom  :0;
                padding-left   :0;
                width          :auto;

                li > button.IdleManager-multi-action {
                    border           : 0;
                    background-color : rgba(0,0,0,0);
                    box-shadow       : 0 0 0 0;
                    background-repeat: no-repeat;
                    background-size  : contain;
                    width            : 30;
                    height           : 30;

                    &:active:hover {
                        /* Start the shake animation and make the animation last for 0.5 seconds */
                        animation: shake 1s;

                        /* When the animation is finished, start again */
                        animation-iteration-count: infinite;
                    }

                }
            }

        }`
        // Append stylesheet
        const stylesheet = document.createElement('style');
              stylesheet.innerText = style;
        document.head.appendChild(stylesheet);

        const xpLevelDiv = $(`#panel-${skill} > .panel-logo-xp-area`)[0];
            xpLevelDiv.style.marginRight = "5px";
        const newNode    = xpLevelDiv.cloneNode();
            newNode.classList.add("dupe-box");

        // Action buttons
        const btnContainer = document.createElement('div');
            btnContainer.classList.add('IdleManager-multi-action-container');
            newNode.appendChild(btnContainer);
        const ul = document.createElement('ul');
            btnContainer.appendChild(ul);

        const table = document.createElement('table');
        xpLevelDiv.insertAdjacentElement('afterend', table);

        const tr = document.createElement('tr');
        const td = [document.createElement('td'), document.createElement('td')];

        td[0].appendChild(xpLevelDiv);
        tr.appendChild(td[0]);

        td[1].appendChild(newNode);
        tr.appendChild(td[1]);

        table.appendChild(tr);

        newNode.style.minHeight = xpLevelDiv.offsetHeight;
        newNode.style.width     = xpLevelDiv.offsetWidth;

        return newNode;
    }

    static addWikiSearch() {
        const input = document.createElement('input');
            input.style.backgroundColor = "rgb(0, 76, 78)";
            input.style.borderRadius    = "30px";
            input.style.paddingLeft     = "28px";
            input.style.color           = "rgb(192, 192, 192)";
            input.style.border          = "0px";
            input.style.outline         = "none";
            input.placeholder           = "Idle Wiki";
            // input.type = "search";
            input.onkeydown = e => {
                if (e.key != 'Enter' || input.value == "")
                    return;

                window.open("https://idle-pixel.wiki/index.php?search="+ input.value +"&title=Special%3ASearch");
                // input.value = "";
                input.blur();
                suggestionList.innerHTML = "";
                input.style.borderRadius = "12px";
            }

        const icon = document.createElement('img');
            icon.src       = 'https://cdn-icons-png.flaticon.com/512/5968/5968992.png';
            icon.draggable = false;
            icon.style.width     = "22px";
            icon.style.transform = "translate(24px, -1px)";
            icon.onclick = () => {
                if(input.value == "")
                    window.open("https://idle-pixel.wiki/")
                else {
                    window.open("https://idle-pixel.wiki/index.php?search="+ input.value +"&title=Special%3ASearch");
                    input.value = "";

                }
            };

        const container = document.createElement('span');
            container.className = "float-end";
            container.id        = "IdleManager-wiki-search";
            container.style.paddingRight = "5px";
            // container.style.transition   = "all 0.2s ease 0.2s";
            container.style.position     = "relative";

        const suggestionContainer = document.createElement('div');
            suggestionContainer.style.width        = "100%";
            suggestionContainer.style.position     = "absolute";
            suggestionContainer.style.paddingRight = "5px";
            suggestionContainer.style.paddingLeft  = "22px";
            suggestionContainer.style.userSelect   = "none";

        const suggestionList = document.createElement('ul');
            suggestionList.style.backgroundColor = "rgb(0, 76, 78)";
            suggestionList.style.borderRadius    = "0 0 12px 12px";
            suggestionList.style.listStyleType   = "none";
            suggestionList.style.paddingLeft  = 0;


        const generateSearchSuggestions = () => {
            GM.xmlHttpRequest({
                method: "GET",
                url: `https://idle-pixel.wiki/api.php?action=opensearch&format=json&formatversion=2&search=${input.value}&namespace=0&limit=10`,
                onload: function(response) {
                    let data = JSON.parse(response.responseText);

                    if (!data[1] || !data[1].length)
                        return;
                    input.style.borderRadius = "12px 12px 0 0";

                    let lastLi;
                    for (let i = 0; i < data[1].length; i++){
                        let li = document.createElement('li');
                        li.innerHTML = data[1][i];
                        li.onclick = e => {
                            window.open(data[3][i]);
                            suggestionList.innerHTML = "";
                            input.style.borderRadius = "12px";
                        }

                        li.onmouseenter = () => li.style.backgroundColor = "rgba(0,0,0, 0.5)";
                        li.onmouseleave = () => li.style.backgroundColor = "";
                        li.style.paddingLeft  = "28px";
                        suggestionList.appendChild(li);
                        lastLi = li;
                    }
                    // suggestionList.children[data[1].length].style.borderRadius ="0 0 12px 12px";
                    lastLi.style.borderRadius ="0 0 12px 12px";
                }
              });
        }

        input.oninput = e => {
            suggestionList.innerHTML = "";
            input.style.borderRadius = "12px";

            if (!input.value){
                return;
            }

            generateSearchSuggestions();
        }

        suggestionContainer.appendChild(suggestionList);

        {   // Add drop-shadow when search box is in focus
            const focusSearch   = () => {
                container.style.filter = "drop-shadow(0 0 4px black)";
            }
            const unfocusSearch = () => {
                container.style.filter = "";
                suggestionList.innerHTML = "";
                input.style.borderRadius = "12px";
            }

            input.onfocus          = () => focusSearch();
            input.onblur           = () => unfocusSearch();
            container.onmouseenter = () => {
                input.onblur = () => {};
                if (document.activeElement == input)
                    return;
                focusSearch();
                suggestionList.innerHTML = "";
                generateSearchSuggestions();
            };
            container.onmouseleave = () => {
                input.onblur = () => unfocusSearch();
                if (document.activeElement != input)
                    unfocusSearch()
            };
        }

        container.appendChild(icon);
        container.appendChild(input);
        container.appendChild(suggestionContainer);

        document.getElementsByClassName('game-top-bar-upper')[0].appendChild(container);
    }

    static addMenuBarButtons() {
        for (let manager of Supervisor.managers) {
            const btnWrapper = document.querySelector(
                "#left-panel-item_panel-" + manager.skill + " > tbody > tr"
            ) ? document.querySelector(
                "#left-panel-item_panel-" + manager.skill + " > tbody > tr"): document.querySelector(
                    "#left-panel-item_panel-" + manager.skill + " > table > tbody > tr");

            // Append the checkbox to the btnWrapper element
            const td = document.createElement("td");
            td.style.textAlign = "right";
            btnWrapper.appendChild(td);
            td.appendChild(
                createToggleSwitch(
                    manager.skill + "_toggle",
                    manager.toggle.bind(manager)
                )
            );
        }
    }

    static styleToggleSwitches() {
        // Dynamically add styles
        var style = document.createElement("style");
        const switchWidth = 36; //60;
        const switchHeight = 20; //34;
        const sliderRadius = 16; //26;

        style.innerHTML = `
        .switch {
            position: relative;
            display: inline-block;
            width: ${switchWidth}px;
            height: ${switchHeight}px;
        }
        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
        }
        .slider:before {
            position: absolute;
            content: "";
            height: ${sliderRadius}px;
            width: ${sliderRadius}px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            transition: .4s;
        }
        input:checked + .slider {
            background-color: #2196F3;
        }
        input:focus + .slider {
            box-shadow: 0 0 1px #2196F3;
        }
        input:checked + .slider:before {
            transform: translateX(${sliderRadius}px);
        }
        .slider.round {
            border-radius: ${switchWidth}px;
        }
        .slider.round:before {
            border-radius: 50%;
        }
        `;

        // Append the style to the head
        document.head.appendChild(style);
    }

    static getImage(item){
        return `https://d1xsc8x7nc5q8t.cloudfront.net/images/${item}.png`;
    }
}

// ----------------- Status classes -----------------
class Status {
    static #timer() {
        return parseInt(getItem("farm_timer_" + this.patchNum));
    }

    static time() {
        return this.#timer > 1 ? this.#timer : 0;
    }

    static isIdle() {
        return this.#timer == 0;
    }

    static isCollectable() {
        return this.#timer == 1;
    }

    static isBusy() {
        return this.#timer > 1;
    }
}

// class StatusItem {
//     get name() {
//         return this.#name;
//     }
//     constructor(name, itemString, stageString) {}

//     #name;
// }

class FarmingPatch extends Status {
    /**
     * @type {number} The number of the farming patch.
     */
    patchNum;

    /**
     * @param {number} patchNum - The number of the farming patch. Must be one of the unlocked patches.
     */
    constructor(patchNum) {
        super();
        this.patchNum = patchNum;
    }

    get #timer() {
        return parseInt(getItem("farm_timer_" + this.patchNum));
    }

    get time() {
        return this.#timer > 1 ? this.#timer : 0;
    }

    get isIdle() {
        return this.#timer == 0;
    }

    get isCollectable() {
        return this.#timer == 1;
    }

    get isBusy() {
        return this.#timer > 1;
    }
}

class CooksBook extends Status {
    static get #timer() {
        return parseInt(getItem("cooks_book_timer"));
    }

    static get time() {
        return this.#timer > 1 ? this.#timer : 0;
    }

    static get isIdle() {
        return this.#timer == 0;
    }

    static get isCollectable() {
        return this.#timer == 1;
    }

    static get isBusy() {
        return this.#timer > 1;
    }
}

/**
 * Represents the status of a boat.
 * @extends Status
 */
class BoatStatus extends Status {
    /**
     * The name of the boat that the status is bound to.
     * @type {string}
     */
    boat;

    /**
     * The time left of the boat trip, in seconds.
     * @type {number}
     */
    get timer() {
        if (this.#lastUpdate && this.#lastUpdate > Date.now() - 1000) {
            return this.#timer;
        }
        this.#timer = getItem(this.boat + "_timer");
        this.#lastUpdate = Date.now();

        return this.#timer;
    }

    set timer(value) {
        this.#timer = value;
        this.#lastUpdate = Date.now();
    }

    /**
     * @param {string} boat The name of the boat that the status is bound to.
     */
    constructor(boat) {
        super();
        this.boat = boat;
        // this.update();
    }

    /**
     * @type {number} The time left of the boat trip, in seconds.
     */
    get time() {
        return this.timer > 1 ? this.timer : 0;
    }

    /**
     * @type {boolean} Whether the boat is collectable.
     */
    get isCollectable() {
        return this.timer == 1;
    }

    /**
     * @type {boolean} Whether the boat is out at sea.
     */
    get isOutAtSea() {
        return this.timer > 1;
    }


    /**
     * @type {boolean} Whether the boat is idle.
     */
    get isIdle() {
        return this.timer == 0;
    }

    get isUnlocked() {
        return getItem(this.boat) === 1;
    }

    get isSendable() {
        // console.log(this.boat, this.timer);
        // console.log(this.isUnlocked, this.isIdle, FishingManager.numBoatsOutAtSea, FishingManager.maxBoatsOutAtSea);
        return this.isUnlocked && this.isIdle && (FishingManager.numBoatsOutAtSea < FishingManager.maxBoatsOutAtSea);

    }

    #timer;
    #lastUpdate;

    // /**
    //  * Updates the status of `boat`.
    //  * @returns {number} The time left of the boat trip, in seconds.
    //  */
    // update = () => {
    //     this.#timer = parseInt(getItem(this.boat + "_timer"));
    //     return this.time;
    // };

    // ----------------- Private -----------------

    // /**
    //  * The time left of the boat trip, in seconds.
    //  * @type {number}
    //  */
    // get #timer() {
    //     return parseInt(getItem(this.boat + "_timer"));
    // }
    // // #timer;
}

class AquariumStatus extends Status {
    constructor() {
        super();
        // this.update();
    }

    get time() {
        return this.#timer;
    }

    get isFed() {
        return this.#timer > 0;
    }

    get isHungry() {
        return this.#timer == 0;
    }

    toString() {
        return (
            "Aquarium status: " +
            (this.isFed ? "fed (" + format_time(this.time) + ")" : "hungry") +
            "."
        );
    }

    /**
     * The time left til aquarium can be fed, in seconds.
     * @type {number}
     */
    get #timer() {
        return parseInt(getItem("aquarium_timer"));
    }
}

// ----------------- Main -----------------
async function play() {
    let gameLoaded = false;
    do {
        gameLoaded =
        document.getElementById("body").getAttribute("style") && document.getElementById("body").getAttribute("style").endsWith("filter: brightness(100%);");
        console.debug("Waiting for game to load...");
        await helpers.sleep(1000);
    } while (!gameLoaded);

    console.debug("Game loaded!");

    Supervisor.initializeGUI();
    Supervisor.loadSettings();
    Supervisor.closeModals();
}

function login() {
    let loginPresetElem = document.querySelector("[id^=form-for-]");
    if (loginPresetElem) loginPresetElem.submit();
}

function main() {
    let urlPath = window.location.pathname;
    switch (urlPath) {
        case "/login/":
            login();
            break;
        case "/login/play/":
            play();
            break;
        default:
            break;
    }
}

// await helpers.sleep(2000);
main();
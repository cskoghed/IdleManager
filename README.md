# IdleManager

IdleManager is a Tampermonkey userscript for **IdlePixel** that adds automation helpers, quality-of-life tools, and quick actions for multiple in-game skills.  
It runs in your browser while you play and helps reduce repetitive manual actions.

## Install with Tampermonkey

[![Install IdleManager](https://img.shields.io/badge/Install-IdleManager-blue?logo=tampermonkey)](https://raw.githubusercontent.com/cskoghed/IdleManager/main/idleManager.user.js)

1. Install the **Tampermonkey** browser extension:
   - Chrome/Edge: https://www.tampermonkey.net/
   - Firefox: https://addons.mozilla.org/firefox/addon/tampermonkey/
2. Click the **Install IdleManager** button above.
3. Confirm installation in the Tampermonkey popup/tab.
4. Open or refresh `https://idle-pixel.com/login/`.
5. Log in to IdlePixel and verify the IdleManager UI/buttons are visible.

### Manual fallback

If one-click install does not open Tampermonkey automatically:

1. Open `idleManager.js` in this repository.
2. Copy the file contents.
3. Create a new Tampermonkey script and paste it.
4. Save and refresh the game page.

## Key features

- Manager framework for several skills and systems in one script.
- Mining helpers:
  - Machinery toggles and preset support.
  - Geode/prism/mineral quick actions.
- Farming automation:
  - Auto-plant and auto-harvest behavior.
- Woodcutting and fishing helpers:
  - Tree/patch actions.
  - Boat handling support.
- Breeding/combat helpers:
  - Automated fight loops for configured areas.
- Market tools:
  - Shopping-list style auto-buy behavior.
  - Player market UI improvements (including listing drag/drop behavior).
- UI extras:
  - Additional control buttons/toggles.
  - Wiki quick search integration.
  - Notification/time helper widgets.
- Persistent settings stored in browser local storage.

## What needs to be improved
- Complete unfinished areas marked with TODOs (for example, preset logic and partial managers).
- Split the script into smaller modules for maintainability (the file is currently very large).
- Add a proper versioning and release flow so updates are easier to distribute.
- Improve inline documentation for configuration options and behavior.
- Add tests (where possible) for utility logic and automation safety checks.

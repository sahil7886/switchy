# Switchy — Chrome Web Store listing draft

## Short description

An elegant, local-only recent-tab switcher for Chrome. Hold a shortcut, cycle through recent tabs, then release to switch.

## Detailed description

Switchy brings app-switcher muscle memory to your browser.

Hold your shortcut and tap its final key to move through the tabs you used most recently. Release the modifier to jump to the selected tab, add Shift to cycle backward, or press Escape to cancel. The switcher stays compact: one polished row of uniform favicons, with up to nine tabs and automatic sizing for smaller windows.

Choose the shortcut that works for you. Switchy supports Control and/or Option (Alt) plus a regular key, and prevents unsupported or browser-reserved combinations from being saved.

Switchy has no server, analytics, or telemetry, and it does not transmit browsing data to Switchy. It keeps the current session's recent-tab order in extension session storage and saves your shortcut in local extension storage. To display favicons, it may load the tab's public HTTPS favicon with no referrer.

To avoid invoking a website's Local Network Access permission, Switchy never renders favicons that use HTTP or point to local/private/internal addresses. Those tabs use the same visual fallback as a missing favicon.

## Suggested category

Productivity

## Privacy declaration

- Single purpose: switch between the recently used tabs in the current browser window.
- User data is not collected, sold, or transferred.
- No remote code is used.
- Permission justification:
  - `tabs`: reads tab metadata in the current window, tracks recency, and activates the chosen tab.
  - `<all_urls>`: presents the in-page switcher and receives the configured shortcut on normal webpages.
  - `storage`: saves the current session's MRU order and the locally chosen shortcut.
  - `scripting`: makes the shortcut available immediately in normal webpages that were already open when Switchy is installed or updated.

## Reviewer test instructions

1. Load two or more normal webpages in the same window.
2. Focus one tab, then use `Control + backtick` (the default), holding Control while tapping backtick to cycle.
3. Release Control to activate the selected tab. Add Shift to cycle backward; press Escape to cancel.
4. Click the Switchy toolbar icon to change the shortcut.
5. The shortcut intentionally does not run on `chrome://` pages, the Chrome Web Store, or other protected browser pages because Chromium prevents extension scripts from receiving events there.

## Prepared store assets

- Manifest icons: 16, 32, 48, and 128 px PNG in `assets/`.
- 1280 x 800 screenshot: `store-screenshot-1280x800.png`.
- 440 x 280 promo tile: `store-assets/promo-tile-440x280.png`.
- The 1400 x 560 marquee tile is optional.
- Optional: upload the existing Switchy demonstration video to YouTube and add the link.

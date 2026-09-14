# Switchy

A local-only Manifest V3 extension for Chrome and Helium that cycles the most recently active tabs in the current window.

## Interaction

- The default shortcut is `Control + backtick`; hold the modifiers, tap the final key to cycle forward, then release either modifier to switch.
- Add `Shift` to the same shortcut to cycle backward (`Control + Shift + backtick` by default).
- Press `Esc` to cancel.
- The UI is a single favicon row, contains at most nine cells, and automatically contracts on narrow viewports.
- Click the extension toolbar button to change the shortcut. The selector accepts `Control` and/or `Option (Alt)` plus a regular key, while blocking Command, Shift-based base shortcuts, modifier-only keys, and known browser/OS-reserved combinations.
- Switchy attaches its shortcut listener to normal tabs that are already open when it is installed or updated; protected browser pages remain unavailable.

The extension stores only tab IDs in `chrome.storage.session` and the chosen shortcut in local extension storage. It has no Switchy server or analytics. For the visible favicon row, it may load public HTTPS favicons with no referrer; local, private, internal, and HTTP favicon addresses are always replaced with a local fallback. It has an always-ready local content script so modifier release is captured without injecting code mid-gesture. Chrome does not permit extension scripts or their keyboard listeners on `chrome://` pages, the Chrome Web Store, or other protected browser pages. Close those tabs and test the shortcut on a regular website.

## Load locally

1. Open `chrome://extensions` in Chrome or Helium.
2. Enable Developer mode.
3. Choose **Load unpacked** and select this folder.
4. The onboarding tab opens automatically. Choose a shortcut there, or later by clicking the extension toolbar button.

`demo.html` is a static visual preview of the UI.

## Test

Run `npm ci` once, then `npm test`. The suite covers shortcut validation, onboarding capture and storage behavior, favicon safety, the responsive switcher UI, service-worker MRU/session handling, injection recovery, and manifest integrity.

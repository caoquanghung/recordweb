# RecordWeb single-tab capture extension

This unpacked Chromium Manifest V3 extension lets one user action select the exact tab used for tab video, tab audio, and 24 Hz cursor tracking.

## Local installation

1. Open `chrome://extensions` (or the equivalent extension page in Arc/Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. Open `https://recordweb-nine.vercel.app/`, or `http://localhost:3000/` during local development.
5. Reload an already-open RecordWeb tab after installing or reloading the extension so its bridge can connect.
6. Open the target web tab in the same browser and click **RecordWeb Tab Capture** once.

The extension injects the cursor tracker into that tab, opens or focuses RecordWeb, and sends a one-use tab capture stream ID to the RecordWeb page. Do not open the browser's screen-sharing picker for this flow.

## Current scope

- One Chromium tab per recording session.
- Chrome/Chromium 116 or newer is required for consumer-tab-scoped stream IDs.
- Tab video and tab audio come from `chrome.tabCapture`.
- Cursor positions are sampled in the target page viewport at 24 Hz and normalized to `[0, 1]`.
- Browser-internal pages and extension-store pages cannot be captured or scripted.
- The canonical production URL is declared once as `homepage_url` in `manifest.json`; the service worker uses it when opening RecordWeb.
- The bridge accepts that production origin plus `localhost:3000` and `127.0.0.1:3000` for development.
- When the production domain changes, update `homepage_url`, `host_permissions`, and `content_scripts.matches` together, then release a new extension version.

# RecordWeb single-tab capture extension

This unpacked Chromium Manifest V3 extension lets one user action select the exact tab used for tab video, tab audio, and 24 Hz cursor tracking.

## Local installation

1. Open `chrome://extensions` (or the equivalent extension page in Arc/Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. Open the extension details, choose **Extension options**, and set the RecordWeb URL. The default is `http://localhost:3000/`.
5. Reload an already-open RecordWeb tab after changing the URL so its bridge can reconnect on the configured origin.
6. Open the target web tab and click **RecordWeb Tab Capture** once.

The extension injects the cursor tracker into that tab, opens or focuses RecordWeb, and sends a one-use tab capture stream ID to the RecordWeb page. Do not open the browser's screen-sharing picker for this flow.

## Current scope

- One Chromium tab per recording session.
- Chrome/Chromium 116 or newer is required for consumer-tab-scoped stream IDs.
- Tab video and tab audio come from `chrome.tabCapture`.
- Cursor positions are sampled in the target page viewport at 24 Hz and normalized to `[0, 1]`.
- Browser-internal pages and extension-store pages cannot be captured or scripted.
- The configured production URL must match the manifest host patterns. The included manifest accepts localhost, `127.0.0.1`, and Vercel preview/production subdomains.

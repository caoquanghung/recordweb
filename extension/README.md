# RecordWeb single-tab capture extension

This unpacked Chromium Manifest V3 extension lets one user action select the exact tab used for tab video, tab audio, and 24 Hz cursor tracking.

## Local installation

1. Open `chrome://extensions` (or the equivalent extension page in Arc/Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. Open `https://recordweb-nine.vercel.app/`, or `http://localhost:3000/` during local development.
5. Reload an already-open RecordWeb tab after installing or reloading the extension so its bridge can connect.
6. Paste a Google Slides URL into RecordWeb and choose **Open & connect Slides**.
7. In the Slides tab opened by RecordWeb, press `Alt+Shift+R` or click **RecordWeb Tab Capture** once.

The extension injects the cursor tracker into that tab, opens or focuses RecordWeb, and sends a one-use tab capture stream ID to the RecordWeb page. Do not open the browser's screen-sharing picker for this flow.
Standard Google Slides edit/view URLs are opened in their `/present` form so the authorized tab is the presenter surface; published presentation URLs are preserved.

After the one-time authorization, **Start recording** automatically focuses the connected Slides tab. While presenting, `Alt+P`, `Alt+S`, `Alt+M`, and `Alt+C` are relayed to RecordWeb for pause/resume, stop, microphone mute, and camera visibility. Stopping returns focus to RecordWeb.
If Chrome does not assign the suggested shortcut because of a local conflict, open `chrome://extensions/shortcuts` and assign a preferred key to **Connect the current Google Slides tab to RecordWeb**.

## Current scope

- One Chromium tab per recording session.
- Chrome/Chromium 116 or newer is required for consumer-tab-scoped stream IDs.
- Tab video and tab audio come from `chrome.tabCapture`.
- Cursor positions are sampled in the target page viewport at 24 Hz and normalized to `[0, 1]`.
- Browser-internal pages and extension-store pages cannot be captured or scripted.
- The canonical production URL is declared once as `homepage_url` in `manifest.json`; the service worker uses it when opening RecordWeb.
- The bridge accepts that production origin, `localhost:3000`, `127.0.0.1:3000`, and RecordWeb preview deployments ending in `-coannoacs-projects.vercel.app`. The manifest must match `*.vercel.app`, but the bridge returns immediately on unrelated Vercel projects.
- When the production domain changes, update `homepage_url`, `host_permissions`, and `content_scripts.matches` together, then release a new extension version.
- Tab focus, badge updates, and port messages tolerate tabs closing or extension reloads without unhandled Promise rejections. Explicit disconnect removes the injected tracker listeners and permits clean reinjection.

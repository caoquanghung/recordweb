# RecordWeb presentation cursor extension

This unpacked Chromium Manifest V3 extension automatically prepares 24 Hz cursor tracking for the Google Slides tab opened by RecordWeb. Native browser screen sharing supplies tab video and audio.

## Local installation

1. Open `chrome://extensions` (or the equivalent extension page in Arc/Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. Open `https://recordweb-nine.vercel.app/`, or `http://localhost:3000/` during local development.
5. Reload an already-open RecordWeb tab after installing or reloading the extension so its bridge can connect.
6. Paste a Google Slides URL into RecordWeb and choose **Open Slides & prepare cursor**.
7. Configure the camera and microphone, then press **Start recording**.
8. In Chrome's share picker, choose the Google Slides tab opened by RecordWeb and enable tab audio when needed.

The extension's static content script initializes cursor tracking automatically on supported Google Slides URLs. No toolbar click or extension shortcut is needed per recording session. Chrome still requires explicit confirmation in its native share picker for every new screen-share stream.
Standard Google Slides edit/view URLs are opened in their `/present` form so the authorized tab is the presenter surface; published presentation URLs are preserved.

After the countdown, RecordWeb automatically focuses the prepared Slides tab. While presenting, `Alt+P`, `Alt+S`, `Alt+M`, and `Alt+C` are relayed to RecordWeb for pause/resume, stop, microphone mute, and camera visibility. Stopping returns focus to RecordWeb and releases the native screen-share stream after recorder finalization.

## Current scope

- One Chromium tab per recording session.
- Chrome/Chromium 116 or newer remains the supported baseline.
- Tab video and tab audio come from the browser's `getDisplayMedia()` stream; sharing permission cannot be persisted.
- Cursor positions are sampled in the target page viewport at 24 Hz and normalized to `[0, 1]`.
- Cursor tracking is restricted to `https://docs.google.com/presentation/*`.
- The canonical production URL is declared once as `homepage_url` in `manifest.json`; the service worker uses it when opening RecordWeb.
- The bridge accepts that production origin, `localhost:3000`, `127.0.0.1:3000`, and RecordWeb preview deployments ending in `-coannoacs-projects.vercel.app`. The manifest must match `*.vercel.app`, but the bridge returns immediately on unrelated Vercel projects.
- When the production domain changes, update `homepage_url`, `host_permissions`, and `content_scripts.matches` together, then release a new extension version.
- Tab focus, badge updates, and port messages tolerate tabs closing or extension reloads without unhandled Promise rejections. Explicit disconnect resets tracking without requiring another toolbar authorization.

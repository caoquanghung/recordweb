# RecordWeb presentation cursor extension

This unpacked Chromium Manifest V3 extension automatically prepares 24 Hz cursor tracking for the Google Slides tab opened by RecordWeb. Native browser screen sharing supplies tab video and audio.

## Local installation

1. Open `chrome://extensions` (or the equivalent extension page in Arc/Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. Open `https://recordweb-nine.vercel.app/`, or `http://localhost:3000/` during local development.
5. Reload an already-open RecordWeb tab after installing or reloading the extension so its bridge can connect.
6. Configure and connect the camera and microphone in RecordWeb.
7. Paste a Google Slides URL and choose **Connect Google Slides**.
8. Wait for cursor tracking to connect, then choose the prepared Google Slides tab in Chrome's share picker and enable tab audio when needed.
9. Confirm the live preview and press **Start recording**.

The extension's static content script initializes cursor tracking automatically on supported Google Slides URLs. No toolbar click or extension shortcut is needed per recording session. Chrome still requires explicit confirmation in its native share picker for every new screen-share stream.
Standard Google Slides edit/view URLs are opened in their `/present` form so the authorized tab is the presenter surface; published presentation URLs are preserved.
Before creating a tab, the extension compares the presentation ID with all open Google Slides tabs. It reuses the most recently used matching tab regardless of `/edit`, `/view`, `/present`, account prefix, or query parameters. An editable `/edit`, `/view`, or `/preview` tab is navigated in place to `/present`, preserving its tab ID so cursor tracking follows the presentation navigation. Both reused and newly created tabs are prepared in the background, so RecordWeb remains active until the countdown completes. A new tab is created only when no matching deck is already open. Published presentation URLs remain unchanged.

The pre-session **Ready to record** handoff module remains implemented, including **Continue in RecordWeb** and the Start-button attention state, but its in-tab UI is disabled in version `0.3.7`. Because both reused and newly created Slides targets prepare in the background, setup remains in RecordWeb and the first presentation overlay appears only after recording starts.

After the countdown, RecordWeb automatically focuses the prepared Slides tab. During an active recording, a compact **Recording** pill appears in the bottom-right corner. Hovering or clicking expands pause/resume, microphone, camera, and **End session** controls; it collapses again after a short period of inactivity. The control is isolated from Google Slides with Shadow DOM and follows the active fullscreen element. Because it is rendered inside the shared tab, it is visible in the captured video while shown.

`Alt+P`, `Alt+S`, `Alt+M`, and `Alt+C` remain available for pause/resume, stop, microphone mute, and camera visibility. **End session** hides the overlay immediately, stops the recording, waits for recorder and cursor finalization, and only then disconnects the prepared tab, display stream, camera, and microphone. A normal Stop keeps camera and microphone connected for another take.

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
- Version `0.3.1` re-pairs the tracker after same-tab Slides navigation/fullscreen reloads and resumes an active cursor session from its latest timestamp/index.
- Version `0.3.2` reuses and focuses an existing tab for the same presentation ID before creating a new tab.
- Version `0.3.3` adds the auto-collapsing in-tab recording toolbar and a finalization-safe **End session** action.
- Version `0.3.4` moves a reused editable Slides tab into `/present` before recording and prevents a stale navigation port from deleting its replacement tracker port.
- Version `0.3.5` adds the pre-session **Ready to record** handoff and highlights/focuses Start after returning to RecordWeb without bypassing Chrome's required share-picker gesture.
- Version `0.3.6` keeps RecordWeb active while preparing either a reused or newly created Slides tab; the target is focused only after recording starts.
- Version `0.3.7` disconnects the redundant pre-session Ready overlay from the UI while retaining its implementation behind a feature flag; the active-recording toolbar is unchanged.

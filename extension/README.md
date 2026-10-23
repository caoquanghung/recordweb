# RecordWeb presentation cursor extension

This unpacked Chromium Manifest V3 extension automatically prepares 24 Hz cursor tracking for the Google Slides tab opened by RecordWeb. Native browser screen sharing supplies tab video and audio.

## Local installation

1. Open `chrome://extensions` (or the equivalent extension page in Arc/Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory.
4. Open `https://recordweb-nine.vercel.app/`, or `http://localhost:3000/` during local development.
5. Reload an already-open RecordWeb tab after installing or reloading the extension so its bridge can connect.
6. Configure and connect the camera and microphone in RecordWeb.
7. Open the presentation in a Google Slides tab, then choose **Connect Google Slides** in RecordWeb.
8. Choose that tab in Chrome's share picker, enable tab audio when needed, and press **Share**. RecordWeb verifies that exact selected tab before keeping the preview.
9. Confirm the live preview and press **Start recording**.

The extension's static content script initializes cursor tracking automatically on supported Google Slides URLs. No toolbar click or extension shortcut is needed per recording session. Chrome still requires explicit confirmation in its native share picker for every new screen-share stream.
The default Studio UI does not request or store a Slides URL. Its Connect action opens Chrome's picker directly and resolves the selected tab through Capture Handle. The extension still retains its URL-based lookup/opening module for future or non-UI workflows: when explicitly invoked, it can compare presentation IDs, reuse a matching tab, normalize editable URLs to `/present`, or create a background tab while preserving published presentation URLs.

After the user selects a tab in Chrome's share picker, version `0.3.9` reads the tab's opaque Capture Handle and asks the extension to resolve it to the matching tracker port. This makes the picker-selected tab the cursor target without requiring a URL field. A window, full screen, non-Slides tab, or unregistered Slides tab is rejected and its stream is stopped. Once verified, RecordWeb is focused again and shows the retained stream in Studio preview. Pressing **Start recording** immediately focuses that verified Slides tab while RecordWeb runs the countdown and starts its recorders.

After picker verification, the selected Slides tab exposes the compact, auto-collapsing **Ready to record** control. If the teacher visits the Slides tab to make last-minute edits, expanding the control and choosing **Start recording** sends the same guarded Start command to the connected Studio without reopening the picker. The existing RecordWeb Start button remains available in Studio.

After Start, RecordWeb automatically focuses the verified picker-selected Slides tab. During an active recording, a compact **Recording** pill appears in the bottom-right corner. Hovering or clicking expands pause/resume, microphone, camera, and **End session** controls; it collapses again after a short period of inactivity. The control is isolated from Google Slides with Shadow DOM and follows the active fullscreen element. Because it is rendered inside the shared tab, it is visible in the captured video while shown.

`Alt+P`, `Alt+S`, `Alt+M`, and `Alt+C` remain available for pause/resume, stop, microphone mute, and camera visibility. **End session** hides the overlay immediately, stops the recording, waits for recorder and cursor finalization, and only then disconnects the selected tab, display stream, camera, and microphone. A normal Stop keeps camera and microphone connected for another take.

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
- Version `0.3.7` initially disconnected the pre-session Ready overlay while retaining its implementation; it is enabled again in the current flow so a verified target tab can start the connected Studio session.
- Version `0.3.8` adds an explicit post-picker return to RecordWeb; the prepared Slides tab is activated when the user presses Start recording.
- Version `0.3.9` adds an opaque Capture Handle handshake so the exact picker-selected Google Slides tab becomes both the live-preview source and cursor target; mismatched sources are rejected before recording.
- Version `0.4.0` re-enables the pre-session target-tab bar after picker verification and lets its **Start recording** action invoke the same guarded Studio start flow without reacquiring the shared tab.
- Version `0.4.1` tolerates asynchronous Capture Handle publication and tracker registration after the picker returns, preventing a valid new share from being stopped by the handshake race.
- Version `0.4.2` makes cursor capture fail closed: recording waits for a `CURSOR_STARTED` acknowledgement, finalization waits for `CURSOR_STOPPED` and the indexed final sample, and an active tracker disconnect stops the recording instead of silently continuing without cursor data.
- Version `0.4.3` makes Capture Handle publication lifecycle-safe for Google Slides: one stable handle is reapplied at document, DOM, load, pageshow, and bounded delayed checkpoints, while the DOM handle is published only after Chrome accepts the configuration.
- Version `0.4.4` adds frame-aware pointer tracking for Google Slides presentation fullscreen. A minimal sensor observes matching child frames and eligible `about:blank` descendants, maps nested-frame coordinates into the top viewport, and forwards them to the existing single 24 Hz tracker without duplicating session controls.
- Version `0.4.5` makes Connect and repeat recording resilient to Manifest V3 worker suspension. The Studio bridge and Slides tracker reconnect with bounded backoff, the tracker re-registers its handle/session state, cursor commands tolerate a short reconnect window, and every Connect asks open Slides tabs to reapply their existing Capture Handle immediately before the native picker without delaying its user gesture.

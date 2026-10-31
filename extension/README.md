# RecordWeb presentation cursor extension

This unpacked Chromium Manifest V3 extension automatically prepares 24 Hz cursor tracking for the Google Slides tab opened by RecordWeb. Native browser screen sharing supplies tab video and audio.

## Local development

1. Run `npm run extension:dev` from the repository root. This creates an unpacked development build in `artifacts/extension-development/` for both `http://localhost:3000/` and the canonical production origin from `extension/manifest.json`.
2. Start the website with `npm run dev` and open `http://localhost:3000` (not `127.0.0.1`).
3. In `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `artifacts/extension-development/`. Its name includes **(Development)**.
4. Reload any already-open localhost and Google Slides tabs after installing or rebuilding the extension. Use Chrome's **Reload** button for the unpacked extension after each rebuild.
5. Use a separate browser profile for development, or disable the publication extension while testing. Both variants inject a Slides tracker and cannot safely track the same Slides tab at once.

The publication source remains `extension/manifest.json`. The development build is generated and ignored by Git; rebuild it after changing extension code. Its toolbar button opens localhost, while its bridge also works on the exact production origin for deployment testing.

## Publication installation

1. Open `chrome://extensions` (or the equivalent extension page in Arc/Edge).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this `extension/` directory (or a directory extracted from the Store ZIP).
4. Open the canonical production URL declared by `homepage_url` in `manifest.json`.
5. Reload an already-open RecordWeb tab after installing or reloading the extension so its bridge can connect.
6. Configure and connect the camera and microphone in RecordWeb.
7. Open the presentation in a Google Slides tab, then choose **Connect Google Slides** in RecordWeb.
8. Choose that tab in Chrome's share picker, enable tab audio when needed, and press **Share**. RecordWeb verifies that exact selected tab before keeping the preview.
9. Confirm the live preview and press **Start recording**.

## Chrome Web Store package

Run `npm run extension:package` from the repository root. The command creates a versioned, validated publication ZIP under `artifacts/chrome-web-store/` whose application origin is derived from `homepage_url`; localhost, loopback, broad Vercel wildcard access, tests, development documentation, and the editable SVG icon are excluded. Version `0.4.10` is also backed up in `extension/releases/` so it can be committed with the source. For later releases, copy the ZIP there and commit or tag the corresponding source revision. The package command refuses to replace a ZIP for an existing version. Store listing copy, permission explanations, reviewer notes, privacy disclosures, and the remaining publisher steps are maintained in `docs/chrome_web_store_submission.md`.

The extension's static content script initializes cursor tracking automatically on supported Google Slides URLs. No toolbar click or extension shortcut is needed per recording session. Chrome still requires explicit confirmation in its native share picker for every new screen-share stream.
The default Studio UI does not request or store a Slides URL. Its Connect action opens Chrome's picker directly and resolves the selected tab through Capture Handle. The extension still retains its URL-based lookup/opening module for future or non-UI workflows: when explicitly invoked, it can compare presentation IDs, reuse a matching tab, normalize editable URLs to `/present`, or create a background tab while preserving published presentation URLs.

## Module map

- `extension-protocol.js`: shared port names, message names, channel, and reconnect timings.
- `resilient-port.js`: reconnect and optional outbound-message queue used by both content-script clients.
- `recordweb-bridge.js`: the narrow RecordWeb page ↔ extension transport boundary.
- `capture-handle-main.js`: MAIN-world Capture Handle producer for a Slides document.
- `cursor-frame-sensor.js`: child-frame pointer mapping for Slides presentation surfaces.
- `cursor-sampler.js`: session clock, pause/resume state, 24 Hz sampling, and final sample.
- `tracker-controls.js`: isolated Shadow DOM ready/recording controls.
- `tracker-content.js`: top-frame orchestration between handle registration, pointer input, sampler, controls, and the tracker port.
- `google-slides.js`: URL parsing and deck matching for the dormant URL-based flow.
- `service-worker.js`: tab/port registry, Capture Handle resolution, focus routing, and tracker-loss policy.

On the web app side, `useTabCaptureExtension.ts` owns connection-facing React state, while `extensionCursorCapture.ts` owns the cursor start/stop acknowledgements, sample drain, and `CursorTrajectory` assembly. `captureHandle.ts` only reads and waits for the browser Capture Handle.

After the user selects a tab in Chrome's share picker, version `0.3.9` reads the tab's opaque Capture Handle and asks the extension to resolve it to the matching tracker port. This makes the picker-selected tab the cursor target without requiring a URL field. A window, full screen, non-Slides tab, or unregistered Slides tab is rejected and its stream is stopped. Once verified, RecordWeb is focused again and shows the retained stream in Studio preview. Pressing **Start recording** keeps or returns focus to RecordWeb for the visible three-second countdown, then focuses the verified Slides tab and starts the cursor/recorder handshake.

After picker verification, the selected Slides tab exposes the compact, auto-collapsing **Ready to record** control. If the teacher visits the Slides tab to make last-minute edits, expanding the control and choosing **Start recording** sends the same guarded Start command to the connected Studio without reopening the picker. The existing RecordWeb Start button remains available in Studio.

After Start, RecordWeb automatically focuses the verified picker-selected Slides tab. During an active recording, a compact **Recording** pill appears in the bottom-right corner. Hovering or clicking expands microphone, camera, and **End session** controls; it collapses again after a short period of inactivity. The control is isolated from Google Slides with Shadow DOM and follows the active fullscreen element. Because it is rendered inside the shared tab, it is visible in the captured video while shown.

`Alt+S`, `Alt+M`, and `Alt+C` remain available for stop, microphone mute, and camera visibility. Recording remains continuous until stopped. **End session** hides the overlay immediately, stops the recording, waits for recorder and cursor finalization, and only then disconnects the selected tab, display stream, camera, and microphone. A normal Stop keeps camera and microphone connected for another take.

## Current scope

- One Chromium tab per recording session.
- Chrome/Chromium 116 or newer remains the supported baseline.
- Tab video and tab audio come from the browser's `getDisplayMedia()` stream; sharing permission cannot be persisted.
- Cursor positions are sampled in the target page viewport at 24 Hz and normalized to `[0, 1]`.
- Cursor tracking is restricted to `https://docs.google.com/presentation/*`.
- The canonical production URL is declared once as `homepage_url` in `manifest.json`; the service worker uses it when opening RecordWeb.
- The bridge and service worker accept only the canonical production origin derived from `homepage_url`.
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
- Version `0.4.6` reorganizes the extension into explicit protocol, transport, sampler, toolbar, URL, tracker-orchestration, and service-worker boundaries. It preserves the `0.4.5` wire protocol and fail-closed recording behavior while making each lifecycle independently inspectable.
- Version `0.4.7` writes cursor trajectory schema v2: persisted samples contain only numeric `x`/`y` coordinates, and intervals where the pointer is outside the tracked content are omitted instead of producing nullable coordinates plus a `visible` flag.
- Version `0.4.8` removes localhost and broad Vercel Preview access, derives the only accepted application origin from `homepage_url`, and aligns Store/privacy disclosures with cursor schema v2, which does not record click state.
- Version `0.4.9` preserves those narrow host permissions and validates every packaged content-script match against the canonical RecordWeb and Google Slides origins. The accompanying Store and privacy copy discloses automatic post-recording cloud upload.
- Version `0.4.10` removes pause/resume from the in-Slides recording toolbar and removes the Alt+P shortcut so each recording remains continuous until stopped.

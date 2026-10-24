# Single-Tab Cursor Trajectory

**Decision status:** Implemented; unpacked-extension runtime verification pending

**Capture scope:** One Chromium browser tab per recording session

**Target browsers:** Chrome and Arc

**Sampling rate:** 24 Hz

## 1. Product Contract

A recording session selects exactly one browser tab. That tab is the single source for:

- the screen video stream;
- the tab/system audio stream, when the tab produces audio; and
- the normalized cursor trajectory.

The user must select the target tab only once. Multi-tab tracking, whole-window tracking, and full-display cursor tracking are out of scope.

## 2. One-Selection User Flow

1. The user opens the tab they want to record.
2. The user clicks the RecordWeb extension action, **Record this tab**.
3. The extension receives the active target tab ID from that user gesture.
4. The extension injects the cursor tracker into the target tab.
5. The extension obtains a one-use tab media stream ID through `chrome.tabCapture.getMediaStreamId()`.
6. The extension opens or focuses RecordWeb and immediately transfers the stream ID and target-tab metadata through the RecordWeb bridge.
7. RecordWeb consumes the stream ID, shows video/audio/cursor readiness, and lets the user start recording.
8. Start, pause, resume, and stop commands control both the media session and the cursor sampler.

RecordWeb must not show a second native `getDisplayMedia()` picker in this mode. A normal web page cannot discover which tab was selected in that picker, so keeping both selection mechanisms would create an unreliable tab-to-cursor mapping.

## 3. Extension Architecture

The extension uses Chromium Manifest V3 and requests only:

```json
{
  "permissions": ["activeTab", "scripting", "storage", "tabCapture"]
}
```

The `tabs` permission is not required for the single-tab flow. The extension action already receives the active target tab, and the RecordWeb bridge supplies the consumer tab ID.

```text
Target tab
  ├── chrome.tabCapture video + audio
  └── cursor content script at 24 Hz
                 │
                 ▼
       Manifest V3 service worker
                 │
                 ▼
       RecordWeb bridge content script
                 │
                 ▼
  MediaSessionProvider + useTabCaptureExtension
                 │
                 ▼
  useRecordingSession → IndexedDB → Blob/Neon
```

The extension service worker owns pairing and routing, but it must not be the 24 Hz sampling clock because Manifest V3 service workers may suspend. The active target-tab content script owns the sampler and sends validated JSON-serializable samples through a long-lived extension port.

## 4. Coordinate and Timeline Contract

- Coordinates are relative to the visible content viewport of the captured target tab.
- `x = clientX / viewportWidth` and `y = clientY / viewportHeight`.
- Valid coordinates remain within `[0, 1]`.
- No sample is emitted while the pointer is outside the tracked document.
- The sampler emits one sample every `41.6667 ms` while the pointer is inside the document, including when it has not moved.
- Pause time is excluded from `timestampMs`.
- The cursor asset uses the same `sessionId` as every media asset.
- Target-tab navigation to a different origin invalidates the `activeTab` grant; RecordWeb must warn and mark cursor capture unavailable rather than fabricate samples.

The cursor JSON uses `tracking.mode: "browser-extension-tab"` and includes the extension-known target tab ID only for local session coordination. Persistent output should avoid storing the complete target URL unless the product explicitly requires it.

## 5. Lifecycle and Failure Rules

- Only one target tab may be paired with a recording session.
- Closing the target tab ends its video, audio, and cursor sources.
- Switching to another tab does not change the target. Cursor sampling pauses until the pointer interacts with the captured document again.
- If tab audio is captured, RecordWeb must preserve local playback through the Web Audio graph when Chromium suppresses the tab's normal audio output.
- The one-use media stream ID must be consumed immediately; an expired ID requires the user to invoke the extension again.
- Unsupported browser pages such as `chrome://` and extension-store pages cannot be tracked.
- Cross-origin iframe cursor coverage is not guaranteed in the initial version.

## 6. Migration from the Electron Helper

The existing Electron display cursor helper is a legacy implementation and remains in the repository until the extension flow passes end-to-end verification. The migration must:

1. add the Manifest V3 extension package;
2. add a RecordWeb extension bridge and tab-stream acquisition adapter;
3. replace display selection with a single paired-tab readiness state;
4. keep the existing cursor JSON, IndexedDB, Review, and Library consumers;
5. remove Electron runtime dependencies only after equivalent tests pass; and
6. update deployment instructions for loading an unpacked extension and publishing it later.

Review and Library render the JSON as an interactive timeline player. The player interpolates the cursor between adjacent 24 Hz samples, treats larger timestamp gaps as periods without a cursor, shows a short recent trail over a faint full-session path, and provides play, pause, seek, and playback-speed controls. This visualization is derived in the browser and does not create or upload a second encoded video asset. The stored raw samples remain unchanged.

## 7. RecordWeb Presentation Cursor

An internal RecordWeb presentation is the exception to the extension-only target
flow above. The pointer already occurs inside the trusted presentation DOM, so
`usePresentationCursor` samples it directly at 24 Hz without a second tab identity
or extension injection step.

- Coordinates are normalized to the presentation root and use
  `relativeTo: "captured-presentation-content"`.
- Active recording time excludes pauses using the same start/pause/resume/stop
  controller contract as extension capture.
- The cursor JSON uses `tracking.mode: "recordweb-presentation"`.
- The UI must hide the native cursor and draw the hook's custom cursor state inside
  the captured presentation root before claiming `cursorBakedIntoScreenVideo`.
- Self-tab video, presentation audio, webcam DOM overlay, and cursor samples all
  belong to one recording session and share its session ID.

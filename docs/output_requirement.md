# Recording Session Output Requirements

**Status:** Partially implemented  
**Scope:** Multi-asset recording pipeline  
**Maximum active duration:** 30 minutes

## 1. Purpose

RecordWeb previously produced one composited recording containing the screen, webcam overlay, and mixed audio. It now also produces separate webcam, screen, audio, and Electron-assisted cursor assets so downstream editing and analysis can use the original sources independently.

This document defines the complete five-asset target, timing model, formats, cursor coordinate system, failure behavior, storage metadata, and browser limitations.

### 1.1 Implementation Status

| Asset | Status | Current implementation |
| :--- | :--- | :--- |
| Composite video | Implemented | Existing 1080p canvas plus processed master audio |
| Webcam source | Implemented | Raw camera normalized to 1280×720 at 30 FPS |
| Screen source | Implemented | Raw display stream normalized to 1920×1080 at 30 FPS |
| Audio source | Implemented | Processed Web Audio master in MP4/AAC or WebM/Opus |
| Cursor path | Implemented locally | Electron helper samples a selected display at 24 Hz; finalized JSON is stored in IndexedDB and can be opened or downloaded from Review/Library. Cloud upload and crash-draft checkpointing remain pending. |

## 2. Required Output Set

Every recording session covered by this requirement must produce the following assets:

| Asset | Required content | Target output | Frame/sample rate |
| :--- | :--- | :--- | :--- |
| Composite video | Screen, processed webcam overlay, and mixed audio | 1920×1080 MP4 preferred | 30 FPS |
| Webcam source | Webcam only, before PiP placement and visual effects | 1280×720 MP4 preferred | 30 FPS |
| Screen source | Shared screen/window/tab only | 1920×1080 MP4 preferred | 30 FPS |
| Audio source | Standalone processed master audio, without video | M4A/AAC preferred | 48 kHz |
| Cursor path | Time-aligned normalized cursor samples | UTF-8 JSON | 24 samples/second |

The composite output remains the primary playback and sharing asset. The four source assets are separate files and must not be multiplexed as extra tracks inside the composite file.

This output profile requires an active screen source, webcam source, and at least one audio input before recording can start. Existing screen-only or webcam-only modes may remain as separate legacy profiles, but they do not satisfy this five-asset contract.

## 3. Asset Specifications

### 3.1 Composite Video

- Contains the normalized screen source, processed webcam/PiP presentation, and processed audio master.
- Resolution: `1920×1080`, square pixels, 16:9 display aspect ratio.
- Frame rate: constant target of 30 FPS.
- Preferred format: MP4 with H.264/AVC video and AAC audio.
- Browser fallback: WebM with VP9 or VP8 video and Opus audio.
- Background removal, blur, PiP shape, PiP position, and other Studio effects apply only to this output.
- Existing pause, resume, 30-minute limit, local recovery, and cloud upload behavior remain required.

### 3.2 Webcam Source Video

- Contains only the webcam image, with no screen, Studio UI, or composite overlays.
- Resolution: `1280×720`.
- Frame rate: constant target of 30 FPS.
- Preserve the camera aspect ratio. Letterbox instead of stretching when the camera is not 16:9.
- Capture before background removal, blur, PiP clipping, resizing, and positioning.
- Do not include an audio track.
- Preferred format: MP4/H.264. Fallback: WebM/VP9, then WebM/VP8.

### 3.3 Screen Source Video

- Contains only the selected display, window, or browser tab.
- Normalized output resolution: `1920×1080`.
- Frame rate: constant target of 30 FPS.
- Preserve the source aspect ratio with letterboxing or pillarboxing; never stretch it.
- Do not include the webcam overlay, Studio controls, or a duplicated audio track.
- The cursor should not be burned into the screen video when the browser and capture surface allow cursor exclusion. Metadata must record whether the cursor is present in the pixels.
- Preferred format: MP4/H.264. Fallback: WebM/VP9, then WebM/VP8.

“Full HD” refers to the normalized output canvas. The original capture may have a lower resolution or a different aspect ratio, and the application must preserve the native dimensions in metadata.

### 3.4 Standalone Audio Source

The audio asset is a first-class required output and must finalize independently from every video file.

- Contains the same processed master mix used by the composite recording:
  - microphone after the selected DSP chain;
  - system/tab audio when the browser supplies it;
  - configured microphone and system-audio gains.
- Contains no video track.
- Sample rate: 48 kHz target.
- Preferred format: M4A/MP4 with AAC-LC.
- Fallback format: WebM with Opus.
- Target encoded bitrate: at least 96 kbit/s mono or 160 kbit/s stereo.
- Metadata identifies whether the file contains microphone only, system audio only, or the mixed master.
- Audio remains usable when a video encoder fails.

Lossless WAV is not the default because a 30-minute 48 kHz PCM file can be very large. If lossless audio becomes mandatory, it should be a separate export profile with revised local-storage and Blob-size limits.

### 3.5 Cursor Path File

The cursor path stores pointer-position samples aligned to the active recording timeline.

#### Coordinate system

- Origin: top-left of the captured screen-content coordinate space.
- Horizontal coordinate: `x`, normalized to `[0, 1]`.
- Vertical coordinate: `y`, normalized to `[0, 1]`.
- Top-left: `(0, 0)`; top-right: `(1, 0)`.
- Bottom-left: `(0, 1)`; bottom-right: `(1, 1)`.
- Coordinates are relative to the captured source content, not the RecordWeb viewport or the letterboxed 1920×1080 output canvas.

For `(cursorX, cursorY)` inside capture bounds `(left, top, width, height)`:

```text
x = (cursorX - left) / width
y = (cursorY - top) / height
```

Valid visible samples satisfy `0 <= x <= 1` and `0 <= y <= 1`. Do not silently clamp an out-of-bounds pointer. Set `visible` to `false` and both coordinates to `null`.

#### Sampling and timing

- Sampling rate: 24 samples per active recording second.
- Nominal interval: `1000 / 24 = 41.6667 ms`.
- Use the session active-time clock, not wall-clock time.
- Emit no cursor samples while paused.
- After resume, continue from accumulated active time without a pause-sized gap.
- Synchronize with media using `timestampMs`, not by matching the 24 Hz sample index to 30 FPS video frames.
- Emit a sample at every scheduled interval even when the pointer has not moved.

#### JSON contract

```json
{
  "schemaVersion": 1,
  "sessionId": "018f-example-session-id",
  "sampleRateHz": 24,
  "coordinateSpace": {
    "origin": "top-left",
    "xRange": [0, 1],
    "yRange": [0, 1],
    "relativeTo": "captured-screen-content",
    "sourceWidth": 2560,
    "sourceHeight": 1440
  },
  "timeline": {
    "clock": "active-recording-time",
    "pausedIntervalsExcluded": true,
    "durationMs": 12500
  },
  "tracking": {
    "mode": "native-helper",
    "cursorBakedIntoScreenVideo": false
  },
  "samples": [
    { "index": 0, "timestampMs": 0, "x": 0.42, "y": 0.31, "visible": true },
    { "index": 1, "timestampMs": 41.667, "x": 0.43, "y": 0.31, "visible": true },
    { "index": 2, "timestampMs": 83.333, "x": null, "y": null, "visible": false }
  ]
}
```

Required top-level fields are `schemaVersion`, `sessionId`, `sampleRateHz`, `coordinateSpace`, `timeline`, `tracking`, and `samples`. Every sample requires `index`, `timestampMs`, `x`, `y`, and `visible`.

## 4. Shared Session Timeline

All five assets use one recording coordinator and one monotonic active-time clock:

1. The countdown completes.
2. The coordinator establishes session time `t = 0`.
3. Composite, webcam, screen, audio, and cursor capture start as one operation.
4. Pause pauses every encoder and the cursor sampler.
5. Resume resumes them from the same accumulated active timestamp.
6. Stop requests final data and finalizes every asset.

Synchronization tolerances:

- Maximum start-time difference between encoded assets: 100 ms.
- Maximum duration difference between required media assets: 250 ms.
- Cursor timestamps remain within one cursor interval (`41.667 ms`) of the active-time clock.
- Every asset carries the same `sessionId`.

Create one `MediaRecorder` per encoded asset, with at most one video track in each recorder. Do not place independent screen and webcam tracks into one `MediaRecorder` and expect separate files.

## 5. File Naming and Packaging

Recommended local filenames:

```text
<sessionId>-composite.<mp4|webm>
<sessionId>-webcam.<mp4|webm>
<sessionId>-screen.<mp4|webm>
<sessionId>-audio.<m4a|webm>
<sessionId>-cursor.json
```

Recommended Blob pathnames:

```text
recordings/<sessionId>/composite.<ext>
recordings/<sessionId>/webcam.<ext>
recordings/<sessionId>/screen.<ext>
recordings/<sessionId>/audio.<ext>
recordings/<sessionId>/cursor.json
```

Store the actual browser-produced MIME type and codec. Never give a WebM file an `.mp4` extension.

The review screen should offer individual downloads for the composite, webcam, screen, audio, and cursor assets. When the standalone audio Blob is finalized, the client decodes it once and derives exactly 120 normalized amplitude peaks. These peaks are stored with the local recording in IndexedDB and, after cloud upload, in the audio asset's `metadata.waveformPeaks` JSON plus the parent recording settings for authorized Library views. The waveform is derived metadata, not another Blob object.

Review and Library use the stored peaks to render a responsive waveform without downloading and decoding the complete cloud audio file on every visit. Legacy recordings without stored peaks may decode their local audio Blob or cloud audio URL as a compatibility fallback. The waveform includes synchronized playback and click-to-seek controls. The live analyser remains a VU-meter source and must not be presented as the recorded waveform. Downloading all assets as one package is a future enhancement.

## 6. Local Recovery Requirements

- Each encoded stream emits periodic chunks, targeted at one-second intervals.
- IndexedDB keys chunks by both `sessionId` and asset kind.
- Cursor samples are checkpointed incrementally, not only at stop.
- Recovery reports every asset as complete, recoverable, unavailable, or corrupted.
- One source’s checkpoint failure must not delete another source’s recoverable data.
- WebM duration repair applies independently to each affected WebM asset.
- Estimate available browser storage before recording and warn when the expected five-asset session approaches quota.

## 7. Cloud Storage and Metadata

Each asset uploads directly from the browser to Vercel Blob. Video and audio bytes must not be buffered through a Next.js Route Handler.

Migration `0002_recording_assets.sql` adds a child record for every uploaded source asset while retaining the legacy composite fields on `recordings` for compatibility:

```text
recording_assets
  id
  recording_id
  kind                  composite | webcam | screen | audio | cursor
  storage_url
  blob_pathname
  mime_type
  file_size_bytes
  resolution            nullable
  fps                    nullable
  sample_rate_hz         nullable
  metadata               JSON
  created_at
```

For the `audio` row, `metadata` includes `waveformPeaks` (120 normalized numbers in the range `[0, 1]`) and `waveformVersion`. No schema migration is required because waveform data uses the existing JSONB metadata column.

The unique `(recording_id, kind)` constraint prevents duplicate source kinds. Deleting a parent recording cascades its child metadata, while the Route Handler deletes the corresponding Blob objects first.

Sharing and deletion operate at the parent recording level by default:

- Sharing grants access to the permitted child assets.
- Deleting a recording deletes all owned Blob assets and metadata.
- Partial deletion failures are reported and retryable.
- Ownership is verified before upload, download, or deletion access to any asset.

## 8. Browser Feasibility and Cursor Constraint

Screen, webcam, and audio source recording is feasible with current browser APIs. Exact cursor-coordinate tracking across an arbitrary desktop is not available to a normal webpage:

- Pointer events expose positions only while the pointer interacts with the RecordWeb document.
- `getDisplayMedia()` provides captured pixels, not operating-system cursor coordinates.
- A page cannot inspect pointer coordinates over another application, another origin, or the desktop.

Exact general-purpose cursor tracking therefore requires one of these capability modes:

| Mode | Coverage | Requirement status |
| :--- | :--- | :--- |
| Native helper or desktop wrapper | Full display/window cursor coordinates | Recommended for exact compliance |
| Browser extension with page instrumentation | Supported browser tabs/pages only | Partial compliance |
| Pointer events in RecordWeb | RecordWeb viewport only | Insufficient for general screen recording |
| Visual detection from captured frames | Cursor must be visible; detection may be inaccurate | Experimental fallback |

Record `tracking.mode` in the cursor JSON. Never claim full cursor tracking when only RecordWeb-local pointer events are available. When exact tracking is unavailable, show a clear warning and store an explicit unavailable state or `visible: false` samples rather than fabricated coordinates.

## 9. Performance and Resource Requirements

This pipeline performs three simultaneous video encodes: composite, screen, and webcam. It is materially more expensive than the former single-encoder design.

- Prefer hardware-accelerated codecs.
- Avoid three independent full-resolution drawing pipelines when frames can be shared safely.
- Monitor dropped frames and encoder errors per asset.
- Reduce optional AI segmentation inference before reducing source-output frame rates.
- Do not silently reduce the required webcam or screen resolution.
- If the device cannot sustain the profile, prevent start or require an explicitly labeled lower-quality profile.
- Avoid retaining unnecessary duplicate copies of all finalized assets in memory.

## 10. Failure and Completion Semantics

- `complete`: all five assets finalized successfully.
- `partial`: the composite is usable, but one or more source assets failed.
- `failed`: no usable composite was produced.

One encoder failure must not discard the remaining assets. The UI identifies the failed asset, preserves successful outputs, and allows upload retry without creating a duplicate session. Cloud metadata must not mark a session complete until all five required assets are ready.

## 11. Acceptance Criteria

1. A 30-second test produces five separate files with one `sessionId`.
2. Composite video is 1920×1080 at a 30 FPS target and includes screen, webcam presentation, and audio.
3. Webcam source is 1280×720 at a 30 FPS target, with no screen or audio track.
4. Screen source is 1920×1080 at a 30 FPS target, with no webcam overlay or audio track.
5. Standalone audio plays independently and matches composite audio within the synchronization tolerance.
6. Cursor JSON contains 24 timestamped samples per active second using normalized top-left coordinates.
7. A five-second pause creates no five-second gap in the active media or cursor timelines.
8. Finalized media durations differ by no more than 250 ms.
9. Local recovery identifies and recovers chunks for every asset independently.
10. Every cloud upload goes directly to Blob and has ownership-scoped metadata.
11. Unsupported cursor-tracking capability is disclosed and represented truthfully.

## 12. Out of Scope

- Server-side video transcoding.
- Timeline editing or recompositing inside RecordWeb.
- Automatic speech transcription.
- Separate microphone and system-audio stem files; the required audio file is the processed master mix.
- Lossless audio by default.
- Cursor click, scroll, keyboard, or application-focus logging.
- Guaranteed MP4 on browsers that cannot encode MP4 through `MediaRecorder`.

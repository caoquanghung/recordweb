# Audio & Video Processing Pipeline

## 1. Video Compositing Pipeline (`CanvasCompositor`)

### 1.1 Resolution & 30 FPS Framing Mechanism
The video recording output standard is fixed at **1920x1080 (16:9 Full HD)** at **30.0 frames per second**.

```javascript
// Visibility-aware frame regulation
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS; // 33.333 ms
let lastFrameTime = performance.now();

function renderLoop(currentTime) {
  const delta = currentTime - lastFrameTime;
  if (!isRecordingPaused && delta >= FRAME_INTERVAL) {
    lastFrameTime = currentTime - (delta % FRAME_INTERVAL);
    drawCompositeFrame();
  }
}

// Foreground: requestAnimationFrame(renderLoop)
// Hidden browser tab: worker clock invokes renderLoop(performance.now())
```

Browsers pause `requestAnimationFrame()` when the document becomes a background tab. RecordWeb therefore uses `startVisibilityAwareFrameLoop()` from `src/lib/frameScheduler.ts`: RAF remains the foreground clock, while a dedicated worker timer supplies ticks when `document.hidden` is true. Delta clamping still caps rendering at the target rate. This scheduler drives the composite canvas, clean source-normalization canvases, and MediaPipe inference loop.

The worker clock prevents the common short/medium background-tab freeze. Browsers or operating systems may still fully suspend a page under memory pressure, battery-saving policies, or mobile backgrounding; a normal web page cannot override full process suspension.

### 1.2 Layout Composition Strategies
* **Background Layer (Screen Capture)**:
  * When screen capture aspect ratio does not match 16:9 (e.g. 16:10 or ultra-wide displays), the engine calculates optimal letterboxing/pillarboxing with deep studio dark background (`#0d1117`) or centered fill.
* **Overlay Layer (Webcam PiP)**:
  * **Shape Modes**:
    1. Circular Bubble (`arc()` clipping path with subtle 3px border glow).
    2. Rounded Rectangle (`roundRect()` clipping path with drop shadow).
    3. Floating Silhouette (Alpha-masked cutout from background segmentation).
  * **Interactive Placement**: Real-time repositioning across 4 screen anchors (Top-Left, Top-Right, Bottom-Left, Bottom-Right) or manual drag-and-drop coordinates.

### 1.3 Clean Source Normalization

`useNormalizedVideoStream` creates independent, fixed-rate source canvases without modifying the raw tracks owned by `MediaSessionProvider`:

* Webcam frames are contained in a `1280×720` canvas at 30 FPS. Black letterboxing preserves the camera aspect ratio, and Studio background effects are not applied.
* Screen frames are contained in a `1920×1080` canvas at 30 FPS. Letterboxing or pillarboxing preserves the selected surface aspect ratio.
* Each normalization canvas exposes one generated video track through `canvas.captureStream(30)`. Cleanup stops only that generated track; raw device tracks remain owned by the media-session provider.
* Normalization runs only while a recording is being prepared or active to avoid permanent extra rendering work.
* Both normalization canvases use the visibility-aware frame scheduler so their encoded source files continue receiving frames when the RecordWeb tab is hidden.
* Standard Studio separates device acquisition from Slides capture. **Connect camera & microphone** acquires the required device streams first; **Connect Google Slides** remains unavailable until the microphone and any mode-required camera are ready, then asks the extension to find or create the presentation tab and waits for its `TARGET_READY` callback before invoking `getDisplayMedia()` from that Slides action. The selected tab stream is owned by `MediaSessionProvider`, drives the setup preview immediately, and is reused by Start rather than reacquired.
* After the picker returns a valid browser-tab stream, Standard Studio sends `FOCUS_APP` through the extension bridge to keep setup on RecordWeb even if Chromium activated the selected tab. The target receives `FOCUS_TARGET` only after Start completes its countdown and the recorders begin.
* If the extension callback takes long enough for Chromium to expire transient user activation, display capture can be rejected. The setup remains open with retry guidance; a connected target makes the next Connect attempt invoke the picker directly.

### 1.4 Presentation Self-Tab Capture (Non-Compositor Path)

The presentation path is intentionally separate from `CanvasCompositor`. PDF and
PPTX files are parsed locally, and the future presentation workspace renders the
slide, raw webcam element, and custom cursor in one DOM subtree. The browser then
self-captures the current RecordWeb tab through `getDisplayMedia()`:

```text
PDF/PPTX renderer -> presentation DOM (slide + raw webcam + cursor)
                 -> current-tab video track
Microphone + captured presentation audio -> Web Audio mixed destination
current-tab video + mixed audio -> useRecordingSession composite recorder
```

* `preferCurrentTab` and `selfBrowserSurface: "include"` make the current tab the
  intended picker target, but the browser still requires a user gesture and an
  explicit permission choice.
* The selected surface is rejected when the browser reports a non-tab
  `displaySurface`. Capture Handle verifies the RecordWeb tab when the API is
  available.
* Chromium Element Capture restricts the stream to the presentation root when
  supported. Otherwise the UI must enter a clean presenter mode because the full
  tab is recorded.
* The captured tab supplies exactly one video track. Webcam remains a DOM overlay
  in that captured track and may also retain the existing optional clean-webcam
  asset. Presentation mode does not run MediaPipe blur/cutout.
* Tab audio is routed into the existing Web Audio system branch with local playback
  suppression disabled. Microphone processing and source-audio outputs keep their
  existing contracts.
* `usePresentationTabCapture` owns and stops the self-capture tracks. Recording
  completion or error releases the self-capture source after recorder finalization.
* Presentation files are limited to 50 MB and 300 pages/slides. They remain local;
  this core phase adds no Blob upload, database row, or sharing contract.
* A presenter may replace the local PDF/PPTX during setup, active recording, or a
  paused recording. Replacement is atomic: the active renderer and captured canvas
  remain unchanged until the candidate file validates, parses, and pre-renders its
  first page. A successful swap repaints the same captured canvas without replacing
  the tab-capture track or restarting `MediaRecorder`; failure keeps the current
  material active.
* `/presentation` reuses the existing Studio chrome, review flow, diagnostics, audio
  controls, and recording controls without modifying `/`. Its source panel never
  requests screen sharing; the recording gesture starts current-tab capture only
  after a deck is ready.
* The capturable DOM root contains only the slide canvas, raw webcam element,
  PDF text/link interaction layer when applicable, countdown, and custom cursor.
  PDF.js text runs remain transparent above the painted page so selection and
  embedded links align with the canvas without duplicating visible glyphs. When
  Element Capture is unavailable, that root is
  promoted to a fixed full-viewport clean presenter surface so full-tab capture
  does not include navigation, side panels, or recording controls.
* Browser fullscreen targets that same capturable DOM root and never replaces it.
  Cursor input remains normalized to the root bounds; resize and fullscreen changes
  re-normalize the last pointer position so the custom cursor stays aligned while
  the viewport changes. Fullscreen remains an explicit presenter gesture in the MVP
  and can be exited with `Escape` or `Shift+F`.
* Presentation workspace initialization passes `null` to MediaPipe and the canvas
  compositor even before capture starts. A screen stream retained by the global
  media provider is never used as presentation video or tab audio.

---

## 2. Background Segmentation & Virtual Studio Engine

### 2.1 MediaPipe Selfie Segmentation Pipeline
```
Webcam Feed (Raw Video Track)
  └─► Video Element
        └─► MediaPipe SelfieSegmentation.send({ image: videoElement })
              └─► onResults(results)
                    ├─► results.segmentationMask (Binary/Alpha confidence map)
                    └─► Canvas 2D Masking Pass
```

### 2.2 Alpha Blending & Compositing Techniques
1. **Silhouette Cutout (Transparent for Screen Overlay)**:
   ```javascript
   // Webcam overlay canvas
   pipCtx.save();
   pipCtx.clearRect(0, 0, pipWidth, pipHeight);
   // 1. Draw segmentation mask
   pipCtx.drawImage(results.segmentationMask, 0, 0, pipWidth, pipHeight);
   // 2. Use source-in to retain only subject pixels where mask is opaque
   pipCtx.globalCompositeOperation = 'source-in';
   pipCtx.drawImage(webcamVideo, 0, 0, pipWidth, pipHeight);
   pipCtx.restore();
   ```

2. **Background Blur**:
   ```javascript
   // 1. Draw blurred webcam frame as background
   pipCtx.filter = 'blur(10px)';
   pipCtx.drawImage(webcamVideo, 0, 0, pipWidth, pipHeight);
   pipCtx.filter = 'none';
   // 2. Draw mask into temporary canvas, then composite sharp subject over blurred background
   pipCtx.drawImage(sharpSubjectCanvas, 0, 0);
   ```

3. **Chroma Key (Fallback)**:
   * Color distance thresholding in RGB/HSV space for green screen setups with customizable tolerance and smoothing parameters.

---

## 3. Web Audio DSP Architecture

### 3.1 Audio Graph Topology

```
[Microphone MediaStream] 
    │
    ▼
MediaStreamAudioSourceNode
    │
    ▼
BiquadFilterNode (High-Pass, 80 Hz)
    │   ── Eliminates AC rumble, desk bumps, sub-bass pops
    ▼
BiquadFilterNode (Peaking, 2800 Hz, Q=1.2, +4dB)
    │   ── Boosts vocal presence, intelligibility and articulation
    ▼
BiquadFilterNode (Low-Pass, 12000 Hz)
    │   ── Cuts ultrasonic hiss and harsh high-frequency noise
    ▼
DynamicsCompressorNode (Thresh: -24dB, Knee: 30dB, Ratio: 4:1)
    │   ── Levels vocal peaks, prevents digital clipping
    ▼
GainNode (Noise Gate Threshold Control)
    ├─► Mixed MediaStreamAudioDestinationNode
    ├─► Microphone MediaStreamAudioDestinationNode
    ├─► Mixed AnalyserNode
    └─► Microphone AnalyserNode

[System / Tab Audio Track]
    │
    ▼
GainNode (System Audio)
    ├─► Mixed MediaStreamAudioDestinationNode
    ├─► System MediaStreamAudioDestinationNode
    ├─► Mixed AnalyserNode
    └─► System AnalyserNode
```

The three analyser branches drive the live mixed, microphone, and system-audio
meters without interrupting the recorder paths. The dedicated source destinations
allow optional microphone-only and system-audio-only recordings while preserving
the existing mixed master stream.

Google Slides recording uses native display capture, so the system gain is not
connected to `AudioContext.destination`; the browser retains normal tab playback
and RecordWeb avoids accidental system-audio feedback.

The Slides extension mounts an isolated, auto-collapsing Shadow DOM toolbar only
while cursor capture is active. Its **End session** command first stops the
coordinated MediaRecorders and cursor sampler. RecordWeb waits until finalization
reaches `ready` or `error` before invoking global media cleanup, so display,
camera, and microphone tracks cannot be cut off before their final chunks and
cursor JSON are collected. The toolbar is inside the shared tab and is therefore
part of the captured pixels while expanded or collapsed.

### 3.2 Sound Filter Parameter Specifications

| Filter Component | Filter Type / Node | Key Parameters | Purpose |
| :--- | :--- | :--- | :--- |
| **Rumble Filter** | `BiquadFilterNode` (`highpass`) | `frequency = 80Hz`, `Q = 0.707` | Cut physical microphone handling rumble and room resonance. |
| **Vocal Enhancer** | `BiquadFilterNode` (`peaking`) | `frequency = 2800Hz`, `gain = 4.0dB`, `Q = 1.2` | Boost clarity and presence in human speech frequencies. |
| **Hiss Reducer** | `BiquadFilterNode` (`lowpass`) | `frequency = 12000Hz`, `Q = 0.707` | Strip high-frequency electronics hiss and electrical noise. |
| **Compressor** | `DynamicsCompressorNode` | `threshold = -24dB`, `knee = 30dB`, `ratio = 4`, `attack = 0.003s`, `release = 0.25s` | Prevent shouting distortion and balance quiet speech. |
| **Noise Gate** | Script/Gain Envelope | `threshold = -50dB`, `hold = 150ms`, `decay = 80ms` | Silence ambient room noise during natural speech pauses. |

---

## 4. Pause, Resume & State Synchronization

### 4.1 Chrono-Timeline Tracking
To ensure that paused time does not cause blank frames or audio-video drift:
* Maintain two timer accumulators:
  * `totalRecordedDuration`: Active recording time (ms).
  * `lastResumeTimestamp`: Timestamp when recording last transitioned to active.
* While paused:
  * Audio nodes continue processing locally, but every active asset recorder is paused so stream ingestion stops together.
  * Canvas render loop continues displaying preview to the user, but canvas frame updates to `MediaRecorder` are frozen or ignored.
* On resume:
  * `lastResumeTimestamp = performance.now()`.
  * Resume every active asset recorder as one coordinated operation.

### 4.2 The 30-Minute Safety Watchdog
* Every tick of the recording timer evaluates:
  $$\text{recordedTime} = \text{totalRecordedDuration} + (\text{performance.now()} - \text{lastResumeTimestamp})$$
* If $\text{recordedTime} \ge 1,800,000 \text{ ms}$ (30 minutes):
  * Trigger `stopRecording()` immediately.
  * Dispatch notification: *"Maximum recording limit of 30:00 reached. Finalizing recording..."*
* Emit an advisory at 15 minutes and a final warning when 60 seconds remain.
* Paused time must not count toward the 30-minute active recording limit.

---

## 5. WebM EBML Metadata Repair & Export

### 5.1 The Chromium WebM Missing Duration Bug
Chromium’s implementation of `MediaRecorder` records WebM video streams as live broadcasts (`Duration: unknown` / `0` in the EBML segment info). As a consequence:
* Video players (VLC, QuickTime, media players) cannot display duration or allow timeline seeking.
* Progress bars remain at `00:00 / 00:00`.

### 5.2 Client-Side EBML Duration Injection
Upon recording completion, the engine:
1. Converts the recording chunks array to an `ArrayBuffer`.
2. Scans the binary EBML header tags for:
   * `0x1549A966` (Segment Info Element).
   * `0x2AD7B1` (TimecodeScale, typically 1,000,000 ns).
   * `0x4489` (Duration Element).
3. Injects a float64 duration value calculated from `totalRecordedDuration`.
4. Outputs the repaired `Blob` ready for instantaneous local download and scrubbable playback.

### 5.3 MediaRecorder Encoding & Chunking Invariants
* Create one recorder for each available asset: composite, webcam, screen, mixed audio, microphone audio, and system audio. Each video recorder receives exactly one video track; source-audio recorders remain optional when their inputs are absent.
* Composite codec selection prefers MP4/H.264 plus AAC when supported, then WebM/VP9 or VP8 plus Opus.
* Webcam and screen selection prefers MP4/H.264 when supported, then WebM/VP9 or VP8. These files contain no audio track.
* Standalone audio selection prefers MP4/AAC when supported, then WebM/Opus. Mixed, processed-microphone, and gained-system files each contain one audio track and no video track.
* Always start every recorder with a one-second chunk timeslice so data is checkpointed periodically instead of retained as one monolithic blob until stop.
* Pause and resume all active recorders together and use one active-time clock for the 30-minute limit and final duration.
* Cursor finalization is idempotent and runs from both explicit Stop and the coordinated recorder stop barrier. If a shared tab closes first and makes recorders inactive, the already collected cursor trajectory is still emitted as JSON.
* Repair every finalized WebM asset independently before preview, download, recovery, or upload.
* Decode and persist 120 normalized waveform peaks independently for every available audio asset.
* A missing optional source or a source-recorder failure produces a partial session warning without discarding a valid composite or other successful assets.

### 5.4 Cross-Session Projects and Fast Merge

* A browser reload or machine shutdown ends the current `MediaRecorder`; continuing
  a lecture later always starts a new coordinated recording session.
* Every session is independently stopped, repaired, finalized, cached, and uploaded
  before it can become a project segment.
* The 30-minute active-time watchdog applies to each segment, not to the sum of all
  segments in a project.
* Continuous playback uses the ordered segment manifest and a derived global
  timeline; it does not require physical concatenation.
* Optional physical merge uses `src/lib/segmentMerger.ts` to demux and remux encoded
  packets with shifted timestamps. No decode/encode path exists. A profile mismatch
  or a segment without an initial video key frame must fail explicitly.

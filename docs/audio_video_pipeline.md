# Audio & Video Processing Pipeline

## 1. Video Compositing Pipeline (`CanvasCompositor`)

### 1.1 Resolution & 30 FPS Framing Mechanism
The video recording output standard is fixed at **1920x1080 (16:9 Full HD)** at **30.0 frames per second**.

```javascript
// Frame Rate Regulation Loop
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS; // 33.333 ms
let lastFrameTime = performance.now();

function renderLoop(currentTime) {
  if (!isRecordingPaused) {
    const delta = currentTime - lastFrameTime;
    if (delta >= FRAME_INTERVAL) {
      lastFrameTime = currentTime - (delta % FRAME_INTERVAL);
      drawCompositeFrame();
    }
  }
  requestAnimationFrame(renderLoop);
}
```

### 1.2 Layout Composition Strategies
* **Background Layer (Screen Capture)**:
  * When screen capture aspect ratio does not match 16:9 (e.g. 16:10 or ultra-wide displays), the engine calculates optimal letterboxing/pillarboxing with deep studio dark background (`#0d1117`) or centered fill.
* **Overlay Layer (Webcam PiP)**:
  * **Shape Modes**:
    1. Circular Bubble (`arc()` clipping path with subtle 3px border glow).
    2. Rounded Rectangle (`roundRect()` clipping path with drop shadow).
    3. Floating Silhouette (Alpha-masked cutout from background segmentation).
  * **Interactive Placement**: Real-time repositioning across 4 screen anchors (Top-Left, Top-Right, Bottom-Left, Bottom-Right) or manual drag-and-drop coordinates.

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
    │   ── Attenuates gain when mic signal falls below noise floor
    ├─────────────────────────────┐
    ▼                             ▼
MediaStreamAudioDestinationNode  AnalyserNode (FFT size 256)
    ▲                             │
    │                             ▼
GainNode (System Audio)       VU Meter & Waveform Visualizer
    │
[System / Tab Audio Track]
```

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
  * Audio nodes continue processing locally, but `mediaRecorder.pause()` suspends stream ingestion.
  * Canvas render loop continues displaying preview to the user, but canvas frame updates to `MediaRecorder` are frozen or ignored.
* On resume:
  * `lastResumeTimestamp = performance.now()`.
  * `mediaRecorder.resume()`.

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
* Select the best supported MIME type at runtime: prefer `video/webm; codecs=vp9,opus`, falling back to `video/webm`, then `video/mp4` for Safari.
* Always start `MediaRecorder` with a chunk timeslice (e.g. `mediaRecorder.start(1000)`) so data is collected periodically instead of one monolithic blob at stop.
* On `mediaRecorder.pause()`, immediately stop active duration accumulation; restore time tracking on `resume()`.
* Never offer the raw WebM blob for download without running the EBML duration patcher, or the file will lack a seekable index header.

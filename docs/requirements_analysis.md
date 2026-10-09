# Requirements Analysis & Technical Feasibility

## 1. Executive Summary

This document presents a comprehensive technical and functional analysis of the web-based recording studio application (**RecordWeb**). The system enables users to capture high-definition screen, webcam, and audio streams directly within a modern browser, perform real-time video compositing (Picture-in-Picture, background removal/blur), process audio through real-time DSP sound filters, and export recordings up to 5 minutes at 30 frames per second without requiring server-side rendering or external software like OBS.

In addition, recordings can be exported locally or uploaded to **Vercel Blob** for cloud streaming links, with session metadata cataloged in **Neon Serverless Postgres** and deployed globally via **Vercel**.

---

## 2. Requirement Breakdown & Feasibility Assessment

### 2.1 Multi-Source Recording (Screen, Webcam, Audio)
* **Requirement**: Record screen, webcam, and microphone/system audio individually or concurrently.
* **Technical Analysis**:
  * **Screen Capture**: Implemented via `navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true })`. Allows capturing full screen, application window, or browser tab.
  * **Webcam Capture**: Implemented via `navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080, frameRate: 30 }, audio: false })`.
  * **Microphone Capture**: Implemented via `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`.
  * **System Audio Capture**: Captured via the audio track of `getDisplayMedia` when the user enables "Share audio" (browser and OS-dependent, native in Chromium on Windows/macOS/Linux).
  * **Feasibility**: **High**. Standardized across modern Chromium, Firefox, and Safari browsers.

### 2.2 Pause, Resume, and Stream Merging
* **Requirement**: Allow users to pause and resume recording, producing a single seamless output file.
* **Technical Challenges & Solutions**:
  * **Native MediaRecorder Pause/Resume**: `MediaRecorder.pause()` and `MediaRecorder.resume()` suspend track encoding. However, standard WebM encoding in Chromium browsers can suffer from timestamp skew or missing duration metadata when paused.
  * **Compositor Canvas Sync**: When paused, the canvas render loop must pause timestamp incrementation, keeping track of active recording duration vs wall-clock elapsed time.
  * **Single Source Merge**: Rather than saving individual file chunks and performing computationally expensive video concatenation with FFmpeg in WebAssembly, all active visual streams (Screen + Webcam) are rendered onto a unified `<canvas>` surface. Audio streams are combined in a `Web Audio API` destination node. Recording is captured directly from `canvas.captureStream(30)` combined with the mixed audio stream. Pausing and resuming operates directly on this single continuous pipeline.
  * **Feasibility**: **High** using Canvas + Web Audio API destination.

### 2.3 30 FPS Lock & 5-Minute Duration Limit
* **Requirement**: Strict 30 FPS playback/recording cadence and a maximum 5-minute video duration cap.
* **Technical Implementation**:
  * **30 FPS Constraint**: The canvas compositing loop utilizes `requestAnimationFrame` with delta time regulation (`1000ms / 30fps ≈ 33.33ms`) and `canvas.captureStream(30)` to ensure a steady 30fps capture rate.
  * **5-Minute Duration**: Precise tracking of cumulative active recording milliseconds.
  * **UX Safeguards**:
    * Circular timer indicator counting down from `05:00` to `00:00`.
    * Visual alert/warning pulse at `00:30` remaining.
    * Automatic graceful invocation of `mediaRecorder.stop()` at exactly `05:00` without data corruption.
  * **Feasibility**: **High**.

### 2.4 Audio Filtering & Sound Processing
* **Requirement**: Real-time sound filtering capabilities.
* **Technical Architecture**:
  * Built on top of the **Web Audio API** (`AudioContext`).
  * **Filter Chain**:
    1. **High-Pass Filter (Rumble/Hum Reduction)**: `BiquadFilterNode` (`type: 'highpass'`, cutoff at 80Hz) to filter out air conditioner hum, table bumps, and mic stand vibrations.
    2. **Voice Clarity / Peaking Filter**: `BiquadFilterNode` (`type: 'peaking'`, center frequency 2.5kHz - 3.5kHz, Q: 1.2, gain: +3dB to +6dB) to boost vocal intelligibility.
    3. **Low-Pass Filter / De-esser**: `BiquadFilterNode` (`type: 'lowpass'`, cutoff at 12kHz) to tame harsh high-frequency sibilance and static hiss.
    4. **Dynamic Range Compressor**: `DynamicsCompressorNode` (Threshold: -24dB, Knee: 30dB, Ratio: 4:1, Attack: 0.003s, Release: 0.25s) to even out vocal volume and prevent clipping/distortion.
    5. **Noise Gate / Threshold Filter**: Gain gating algorithm that silences the audio stream when mic input drops below ambient noise floor.
    6. **Input Gain Control**: `GainNode` for digital microphone volume boost/attenuation.
    7. **Visual Feedback**: Real-time VU meter and frequency spectrum visualizer powered by `AnalyserNode`.
  * **Feasibility**: **High**. Zero external dependencies required; native hardware acceleration.

### 2.5 Background Removal & Virtual Backgrounds
* **Requirement**: Remove or modify the webcam background in real-time.
* **Technical Approaches**:
  * **Primary Method: AI Selfie Segmentation**:
    * Utilizes client-side lightweight neural network models (e.g., Google MediaPipe Selfie Segmentation running via WebGL / WASM).
    * Segments person from background at 30fps.
    * Allows:
      * **Transparent Background**: Presenter silhouette overlaid directly onto screen content in PiP mode.
      * **Background Blur**: Gaussian/box blur applied to the background mask while retaining sharp subject focus.
      * **Virtual Color/Image**: Replacing background with solid studio colors, gradients, or custom uploaded wallpaper.
  * **Secondary Method: Chroma Key (Green Screen)**:
    * High-performance GLSL shader or 2D canvas pixel pass for users with physical green screens.
  * **Performance Optimization**: Downscale input frame to 256x256 / 360p for inference, upscale binary/alpha mask, and apply feathering (alpha smoothing) on the full resolution frame.
  * **Feasibility**: **High** with MediaPipe Web SDK.

### 2.6 Local Storage & Export
* **Requirement**: Allow users to save recorded video directly to local storage.
* **Technical Implementation**:
  * **Direct Download**: Assembling `Blob` from recorded chunks (`type: 'video/webm; codecs=vp9,opus'` or `'video/mp4; codecs=avc1'`), triggering programmatic download via object URL.
  * **WebM Duration Repair**: Using an in-browser duration patcher (`fix-webm-duration`) to inject proper duration and index headers into the WebM container, ensuring scrubbable timelines in VLC, QuickTime, and browsers.
  * **IndexedDB Session Persistence**: Temporary caching of recorded video blobs in IndexedDB (`idb`) so users never lose their recording if they accidentally refresh or navigate away before saving.
  * **File System Access API**: Progressive enhancement using `window.showSaveFilePicker()` for direct saving to the user's filesystem on Chromium.
  * **Feasibility**: **High**.

### 2.7 Cloud Video Storage (Vercel Blob)
* **Requirement**: Optional cloud upload to generate shareable video links and cloud-hosted video streaming.
* **Technical Implementation**:
  * Using `@vercel/blob/client` for direct browser-to-edge uploads, bypassing serverless function payload limits.
  * Delivers high-speed global CDN delivery with HTTP range requests for instant scrubbing.
  * **Feasibility**: **High**.

### 2.8 Cloud Database Persistence (Neon Serverless Postgres)
* **Requirement**: Sync recording catalogs, studio configurations, and session metadata across devices without heavy database maintenance.
* **Technical Implementation**:
  * **Neon Serverless Postgres**: Connect via `@neondatabase/serverless` over HTTPS/WebSocket connection pool.
  * **Data Stored**: Recording metadata (id, title, duration, dimensions, timestamp, file size, filter settings, Vercel Blob public URL) and custom studio configuration presets.
  * **Feasibility**: **High**. Serverless architecture auto-scales from zero with instant compute suspension.

### 2.9 Deployment Architecture (Vercel)
* **Requirement**: Production hosting with continuous deployment and secure serverless backend functions.
* **Technical Implementation**:
  * Frontend built and deployed on Vercel's Edge Network for global low-latency CDN asset caching.
  * Vercel Serverless Functions (`/api/*`) securely proxy queries to Neon Postgres using encrypted environment variable `DATABASE_URL` and authorize uploads with `BLOB_READ_WRITE_TOKEN`.
  * Automatic preview deployments for pull requests and instant zero-downtime production updates upon git push.
  * **Feasibility**: **High**. Standardized developer workflow.

---

## 3. Edge Cases & Risk Mitigation

| Risk / Edge Case | Likelihood | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **User Denies Screen or Camera Permission** | Medium | High | Graceful degradation, informative modal prompts, and ability to retry or toggle individual sources. |
| **User Stops Screen Share from Browser Bar** | Medium | Medium | Listen to `track.onended` on the display media track; gracefully pause or switch to webcam-only layout with alert. |
| **Frame Rate Drop during Heavy Screen Activity** | Medium | Medium | Decouple screen rendering from AI inference; throttle AI background segmentation loop to 15-20 fps if CPU throttles, while keeping canvas compositor at 30 fps. |
| **WebM Metadata Corruption / Zero Duration** | High | Medium | Run client-side WebM EBML header patcher to calculate and write proper header duration before download. |
| **Sudden Tab Closure / Memory Limit** | Low | High | Stream chunks into IndexedDB in real time so completed video chunks can be recovered upon reload. |
| **Large Video Upload Exceeds Serverless Limits** | High | High | Use direct client upload (`@vercel/blob/client`) so file streams straight from browser to edge blob storage without touching function memory. |
| **Database Network Disconnection** | Low | Low | Offline-first approach: all recording and local downloads work completely offline; cloud sync updates asynchronously when online. |

---

## 4. Browser Compatibility Matrix

| Feature | Chrome / Edge | Firefox | Safari (macOS/iOS) |
| :--- | :--- | :--- | :--- |
| `getDisplayMedia` | Full Support | Full Support (No tab audio) | Full Support (macOS 13+) |
| `getUserMedia` | Full Support | Full Support | Full Support |
| `MediaRecorder` | Full Support (WebM, MP4) | Full Support (WebM) | Full Support (MP4) |
| `Web Audio API` | Full Support | Full Support | Full Support (requires user gesture resume) |
| WebGL / WASM (MediaPipe) | Full Support | Full Support | Full Support |
| File System Access API | Full Support | Not Supported (fallback to download) | Not Supported (fallback to download) |
| Vercel Blob Direct Client Upload | Full Support | Full Support | Full Support |
| Neon Serverless via Vercel | Full Support | Full Support | Full Support |

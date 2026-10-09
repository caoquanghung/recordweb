# Implementation Roadmap & Verification Plan

## 1. Technology Stack Selection

To ensure maximum performance, zero latency overhead, and scalable serverless operations, RecordWeb is structured as follows:

| Layer | Selected Technology | Rationale |
| :--- | :--- | :--- |
| **Framework & Runtime** | **Next.js (App Router) + React 19 + TypeScript** | Industry-standard React architecture, unified frontend and serverless API route handlers, end-to-end type safety. |
| **Styling** | **Vanilla CSS (CSS Modules & Custom Properties)** | Strict Vanilla CSS per guidelines, modern glassmorphic design tokens, zero build-time styling overhead. |
| **Visual Rendering** | HTML5 Canvas 2D + WebGL Backend | 30 FPS composition of video feeds, real-time pixel masking, zero-copy streaming via `captureStream(30)`. |
| **Neural Vision** | MediaPipe Selfie Segmentation | High-performance client-side WebGL/WASM person segmentation; runs smoothly on CPU/GPU. |
| **Audio Processing** | Web Audio API | Built-in DSP pipeline (`BiquadFilterNode`, `DynamicsCompressorNode`, `AnalyserNode`, `MediaStreamAudioDestinationNode`). |
| **Stream Capture** | MediaStream + MediaRecorder API | Native hardware-accelerated video/audio encoding (`video/webm; codecs=vp9,opus` / MP4 fallback). |
| **Container Repair** | `fix-webm-duration` EBML patcher | Corrects missing duration headers in browser-generated WebM containers. |
| **Client Storage** | IndexedDB (`idb-keyval`) | Client-side session recovery to prevent data loss on browser refresh. |
| **Cloud Video Storage** | **Vercel Blob** (`@vercel/blob/client`) | Global edge object storage for recorded videos with direct browser streaming and public URLs. |
| **Cloud Database** | **Neon Serverless Postgres** | Serverless SQL database with auto-scaling compute and `@neondatabase/serverless` connection pool. |
| **Cloud Hosting** | **Vercel** | Global Edge CDN hosting with zero-config Git deployments and Next.js Route Handlers (`app/api/*`). |

---

## 2. Phased Development Roadmap

### Phase 1: Project Scaffolding & Media Acquisition Foundation
* Next.js (App Router) + TypeScript scaffolding with strict typing (`types/media.ts`, `types/recording.ts`, `types/database.ts`).
* Implement `useMediaDevices` React hook:
  * Screen capture (`getDisplayMedia`) with audio sharing detection.
  * Webcam capture (`getUserMedia`) with resolution constraints (1080p/720p).
  * Microphone capture with device selection.
* Implement permission lifecycle management and cleanup handlers (`track.stop()`).

### Phase 2: Real-time Canvas Compositing Engine (30 FPS Lock)
* Implement `useCanvasCompositor` React hook:
  * 16:9 canvas (1920x1080) render loop with timestamp delta limiter (`~33.33ms`).
  * Support 3 visual modes: Screen Only, Webcam Only, Picture-in-Picture Studio.
  * Draggable and resizable webcam badge (Circle, Rounded Rect) with coordinates management.
  * Stream extraction via `canvas.captureStream(30)`.

### Phase 3: Web Audio DSP Pipeline & Visualizer
* Implement `useAudioDSP` React hook:
  * Initialize `AudioContext` and mixer destination.
  * Build filter chain: High-Pass (80Hz rumble cut), Vocal Peaking (2.8kHz), Low-Pass (12kHz hiss cut), Dynamic Range Compressor, and Noise Gate.
  * Connect `AnalyserNode` to drive real-time SVG/Canvas VU meter component (`VuMeter.tsx`).
  * Mix microphone and system audio into unified audio track.

### Phase 4: AI Background Segmentation & Virtual Studio
* Implement `useVisionSegmentation` React hook:
  * MediaPipe Selfie Segmentation integration.
  * Real-time segmentation loop generating alpha mask.
  * Implement background modes:
    * **Transparent Cutout**: Composite subject directly onto screen capture without webcam bounding box.
    * **Background Blur**: Multi-pass Gaussian blur on background.
    * **Virtual Wallpaper**: Custom solid colors or studio backgrounds.

### Phase 5: Recording Lifecycle, Pause/Resume & 5-Min Limit
* Implement `useRecordingSession` React hook:
  * Discrete state machine (`idle`, `countdown`, `recording`, `paused`, `stopped`).
  * 3-2-1 pre-roll countdown timer component.
  * Seamless pause and resume with timestamp compensation.
  * 5-minute strict cap watchdog with 30-second warning alert and automatic graceful finalize.
  * Chunk buffering via `mediaRecorder.ondataavailable`.

### Phase 6: WebM Duration Fixer & Local Storage / Export
* Implement client-side persistence and export:
  * Post-recording EBML binary patching (`repairWebmDuration` in `src/lib/ebmlPatcher.ts`).
  * Automatic caching of completed recordings into IndexedDB (`src/lib/idb.ts`) for crash safety.
  * Direct browser download triggering with custom filenames (`RecordWeb_YYYY-MM-DD_HHmmss.webm`).
  * File System Access API picker integration for modern Chromium browsers.
  * `ReviewModal.tsx` with instant video preview, seekable scrubber, and statistics (size, duration, resolution).

### Phase 7: UI/UX Studio Polish & Glassmorphism Aesthetic
* Implement React Studio interface:
  * `StudioStage.tsx`: Responsive 16:9 preview container.
  * `ControlDock.tsx`: Floating recording dock with animated pulse indicator and timer.
  * `SourceSelector.tsx`: Screen / Webcam / PiP selection buttons.
  * `FilterPanel.tsx`: DSP sound filter toggles and gain slider.
  * `CameraSettings.tsx`: PiP badge shapes, size, and background removal toggles.
  * Keyboard shortcut bindings (`Space` for pause/resume, `Alt+S` for stop).

### Phase 8: Cloud Database (Neon) & Video Storage (Vercel Blob)
* Initialize Neon SQL tables (`recordings` and `studio_presets`).
* Connect Next.js App Router API Handlers:
  * `src/app/api/upload/route.ts`: Generate client upload tokens for `@vercel/blob/client`.
  * `src/app/api/recordings/route.ts`: List and save recording metadata via `src/lib/db.ts`.
  * `src/app/api/presets/route.ts`: Load and persist user studio presets.
* Connect `ReviewModal.tsx` to support 1-click cloud upload with copyable share links and real-time progress bar.

### Phase 9: Vercel Deployment & Continuous Integration
* Configure environment variables (`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`) on Vercel dashboard / CLI.
* Setup automated preview and production deployment pipeline via GitHub.

---

## 3. Verification & Validation Protocol

1. **Framerate Stability**: Guarantee 30.0 FPS $\pm 1$ FPS on canvas capture stream.
2. **Audio Filter Efficacy**: Verify audio passes through DSP nodes without audible clipping or distortion.
3. **Seekable WebM Validation**: Ensure timeline seeking works from 00:00 to 05:00 after EBML patching.
4. **Pause/Resume Integrity**: Verify no audio drift, frozen frames, or container corruption across pause intervals.
5. **Auto-Stop Precision**: Verify recording automatically terminates cleanly at exactly 05:00.
6. **Direct Client Blob Upload**: Verify large videos (>50MB) stream successfully directly to Vercel Blob without HTTP 413 Payload Too Large errors.
7. **Neon DB Connectivity**: Verify Next.js route handlers execute without cold-start timeouts and record metadata reaches Neon.
8. **Vercel Production Health**: Test HTTPS production domain on Chrome, Firefox, and Safari for proper media permission handling.

# RecordWeb — Agent Persistent Memory

This file serves as the persistent memory bank for AI agents working on **RecordWeb**. It tracks architectural decisions, technical constraints, environment configurations, current project phase, known quirks, and pending tasks.

---

## 1. Project Snapshot

* **Project**: RecordWeb — High-performance, client-side web recording studio.
* **Core Capabilities**: Screen, webcam, and audio recording with real-time video compositing (PiP, AI background removal/blur), Web Audio DSP filtering, 30 FPS regulation, and dual local/cloud export.
* **Technology Stack**:
  * **Framework**: Next.js 16 (App Router), React 19, TypeScript.
  * **Styling**: Vanilla CSS (CSS Modules & Custom Properties, Dark Glassmorphism design tokens).
  * **Vision AI**: Google MediaPipe Selfie Segmentation (`@mediapipe/selfie_segmentation`) via WebGL/WASM.
  * **Audio Processing**: Native Web Audio API (`AudioContext`, `BiquadFilterNode`, `DynamicsCompressorNode`, `AnalyserNode`).
  * **Video Repair**: Client-side EBML binary duration patching (`fix-webm-duration`).
  * **Database**: Neon Serverless Postgres (`@neondatabase/serverless`) for metadata, presets, and catalogs.
  * **Video Object Storage**: Vercel Blob (`@vercel/blob/client`) for direct client-to-edge uploads.
  * **Hosting**: Vercel (Next.js Edge CDN + Serverless Route Handlers in `src/app/api/*`).

---

## 2. Key Architectural Decisions & Invariants

1. **Framework Choice**: Next.js App Router + React 19 + TypeScript for end-to-end type safety, unified frontend and serverless route handlers, and zero-config Vercel deployment.
2. **Client-Side Video Compositor with React Hooks**:
   * Never record separate tracks directly into `MediaRecorder`.
   * Composite Screen (background) + Webcam (PiP overlay) onto a single `1920x1080` `<canvas>` surface.
   * Frame loop is locked to 30.0 FPS via delta-time throttling (`~33.33ms`) in `requestAnimationFrame`.
   * Capture stream generated via `canvas.captureStream(30)`.
   * Encapsulated in `src/hooks/useCanvasCompositor.ts`.
3. **Web Audio Graph Topology**:
   * Order: Mic Source $\rightarrow$ High-Pass (80Hz) $\rightarrow$ Peaking (2.8kHz, +4dB) $\rightarrow$ Low-Pass (12kHz) $\rightarrow$ Dynamics Compressor (-24dB, 4:1) $\rightarrow$ Noise Gate $\rightarrow$ Master Audio Destination.
   * System audio (from `getDisplayMedia`) is mixed into master destination without passing through vocal mic filters.
   * `AnalyserNode` connected for real-time VU meter (`VuMeter.tsx`).
   * Encapsulated in `src/hooks/useAudioDSP.ts`.
4. **Direct Client Upload to Vercel Blob**:
   * Standard Vercel Serverless Functions have a 4.5MB request body size limit.
   * 5-minute video recordings are 50MB - 150MB+.
   * Videos **MUST** be uploaded using `@vercel/blob/client` (`upload()`) directly from the browser to edge storage after fetching a client token from `src/app/api/upload/route.ts`.
   * Resulting CDN URL is stored in Neon Postgres `recordings.storage_url`.
5. **Resilient Dual Storage**:
   * Local: Immediate direct download as `.webm` (with EBML duration fix in `src/lib/ebmlPatcher.ts`) + automatic IndexedDB session backup (`src/lib/idb.ts`).
   * Cloud: 1-click upload to Vercel Blob with shareable link + metadata in Neon Postgres via `src/app/api/recordings/route.ts`.
6. **UI Standard**: Strictly Vanilla CSS (CSS Modules & custom properties) with dark studio glassmorphic aesthetic (tokens in `docs/ui_ux_specification.md`). No Tailwind or heavy CSS frameworks.

---

## 3. Environment & Configuration State

* **Node.js**: `v26.7.0` | **npm**: `11.19.0`
* **Local Secrets File**: `.env.local` (ignored by Git)
  * `DATABASE_URL`: Neon pooled Postgres connection string (`postgresql://...pooler...neon.tech/neondb?sslmode=require`).
  * `BLOB_READ_WRITE_TOKEN`: Vercel Blob store token (`vercel_blob_rw_...`).
* **Database Schema**:
  * `recordings` table (id, title, duration_seconds, file_size_bytes, resolution, fps, mime_type, local_id, storage_url, blob_pathname, settings, created_at).
  * `studio_presets` table (id, preset_name, pip_shape, pip_size, pip_position, bg_removal_mode, filters_config, updated_at).

---

## 4. Current State & Roadmap Progress

- [x] **Requirements Analysis & Architecture Specs**:
  - [x] `docs/requirements_analysis.md`
  - [x] `docs/system_architecture.md`
  - [x] `docs/audio_video_pipeline.md`
  - [x] `docs/ui_ux_specification.md`
  - [x] `docs/implementation_roadmap.md`
  - [x] `docs/deployment_and_database_guide.md`
- [x] **Agentic Files & Customization Setup**:
  - [x] `AGENTS.md` and `GEMINI.md`
  - [x] `.agents/rules/code_standards.md`
  - [x] `.agents/rules/media_audio_video.md`
  - [x] `.agents/rules/memory_management.md`
  - [x] `.agents/skills/media-pipeline-verifier/SKILL.md`
  - [x] `.agents/skills/canvas-compositor-check/SKILL.md`
- [x] **Phase 1 (Scaffolding): Next.js 16 + React 19 + TypeScript Setup**:
  - [x] Initialized Next.js App Router with TypeScript and Turbopack
  - [x] Installed `@neondatabase/serverless`, `@vercel/blob`, `idb-keyval`, `fix-webm-duration`
  - [x] Defined TypeScript types (`types/media.ts`, `types/recording.ts`, `types/database.ts`)
  - [x] Created database client (`lib/db.ts`), IndexedDB helper (`lib/idb.ts`), EBML duration patcher (`lib/ebmlPatcher.ts`)
  - [x] Created Next.js Route Handlers (`api/upload`, `api/recordings`, `api/presets`)
  - [x] Verified zero TypeScript compilation errors with `npm run build`
- [ ] **Phase 1 (Media Hooks): `useMediaDevices` Implementation** (Next Up)
- [ ] **Phase 2: 30 FPS Canvas Compositor Engine (`useCanvasCompositor`)**
- [ ] **Phase 3: Web Audio DSP Pipeline & VU Meter (`useAudioDSP`)**
- [ ] **Phase 4: MediaPipe AI Background Segmentation (`useVisionSegmentation`)**
- [ ] **Phase 5: Recording Lifecycle, Pause/Resume & 5-Min Limit (`useRecordingSession`)**
- [ ] **Phase 6: WebM Duration Fixer & Local Export / IndexedDB Integration**
- [ ] **Phase 7: Studio React UI & Dark Glassmorphism Styling**
- [ ] **Phase 8: Neon DB & Vercel Blob Integration Testing**
- [ ] **Phase 9: Vercel Deployment & Verification**

---

## 5. Known Gotchas & Browser Quirks

| Quirk / Constraint | Impact | Solution |
| :--- | :--- | :--- |
| **MediaStream Track Hardware Lock** | Camera/Mic light stays on after stop | Always iterate `stream.getTracks()` and call `track.stop()`. |
| **AudioContext Autoplay Policy** | Audio is muted or suspended initially | Check `audioContext.state === 'suspended'` and call `resume()` on user click. |
| **WebM Missing Duration in Chrome** | Video timeline cannot be scrubbed | Run `fix-webm-duration` EBML patcher on recorded blob before export. |
| **Vercel Serverless 4.5MB Payload Limit** | Video upload crashes with HTTP 413 | Use `@vercel/blob/client` direct browser upload; never send video chunks to serverless handler body. |
| **Inference CPU Spike** | Canvas framerate drops below 30 FPS | Run MediaPipe segmentation on downscaled resolution (256x256) and upscale the mask. |
| **Next.js SSR vs Browser Media APIs** | `navigator.mediaDevices` undefined on server | Guard all media access with `"use client"` and React `useEffect` / event handlers. |

---

## 6. Immediate Next Steps

1. Implement `src/hooks/useMediaDevices.ts` to acquire screen, camera, and microphone streams with error handling and track cleanup.
2. Implement `src/hooks/useCanvasCompositor.ts` for the 30 FPS canvas compositing render loop and PiP positioning.

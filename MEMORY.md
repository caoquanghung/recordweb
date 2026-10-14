# RecordWeb — Agent Persistent Memory

This file serves as the persistent memory bank for AI agents working on **RecordWeb**. It tracks architectural decisions, technical constraints, environment configurations, current project phase, known quirks, and pending tasks.

---

## 1. Project Snapshot

* **Project**: RecordWeb — High-performance, client-side web recording studio.
* **Core Capabilities**: Screen, webcam, and audio recording with real-time video compositing (PiP, AI background removal/blur), Web Audio DSP filtering, 30 FPS regulation, and dual local/cloud export.
* **Technology Stack**:
  * **Framework**: Next.js 16 (App Router), React 19, TypeScript.
  * **Styling**: Vanilla CSS (CSS Modules & Custom Properties, adaptive light/dark Glassmorphism design tokens).
  * **Vision AI**: Google MediaPipe Selfie Segmentation (`@mediapipe/selfie_segmentation`) via WebGL/WASM.
  * **Audio Processing**: Native Web Audio API (`AudioContext`, `BiquadFilterNode`, `DynamicsCompressorNode`, `AnalyserNode`).
  * **Video Repair**: Client-side EBML binary duration patching (`fix-webm-duration`).
  * **Database**: Neon Serverless Postgres (`@neondatabase/serverless`) for metadata, presets, and catalogs.
  * **Authentication**: Clerk (`@clerk/nextjs`) with Next.js 16 `src/proxy.ts`.
  * **Video Object Storage**: Vercel Blob (`@vercel/blob/client`) for direct client-to-edge uploads.
  * **Hosting**: Vercel (Next.js Edge CDN + Serverless Route Handlers in `src/app/api/*`).
  * **Cursor Capture Target**: The `extension/` Chromium Manifest V3 package selects one tab once and supplies its video, audio, and 24 Hz cursor samples. Static/build checks pass; unpacked-extension runtime verification is pending. The existing Electron helper is deprecated legacy fallback code.

---

## 2. Key Architectural Decisions & Invariants

1. **Framework Choice**: Next.js App Router + React 19 + TypeScript for end-to-end type safety, unified frontend and serverless route handlers, and zero-config Vercel deployment.
2. **Client-Side Video Compositor with React Hooks**:
   * Never place multiple independent video tracks in one `MediaRecorder`. The composite and each clean source use separate, single-video-track recorders coordinated by one session hook.
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
   * Video recordings are far larger than the 4.5MB serverless body limit, especially at the 30-minute maximum.
   * Videos **MUST** be uploaded using `@vercel/blob/client` (`upload()`) directly from the browser to edge storage after fetching a client token from `src/app/api/upload/route.ts`.
   * Resulting CDN URL is stored in Neon Postgres `recordings.storage_url`.
5. **Resilient Dual Storage**:
   * Local: Immediate direct download as `.webm` (with EBML duration fix in `src/lib/ebmlPatcher.ts`) + automatic IndexedDB session backup (`src/lib/idb.ts`).
   * Cloud: 1-click upload to Vercel Blob with shareable link + metadata in Neon Postgres via `src/app/api/recordings/route.ts`.
6. **UI Standard**: Strictly Vanilla CSS (CSS Modules & custom properties) with adaptive light/dark studio glassmorphism (tokens in `docs/ui_ux_specification.md`). Theme defaults to the OS preference and persists in `localStorage` as `recordweb-theme`. No Tailwind or heavy CSS frameworks.
7. **Documentation Source of Truth**: `docs/system_architecture.md` is authoritative for subsystem boundaries, data flow, and risks (R1–R5); `docs/audio_video_pipeline.md` is authoritative for the media pipeline. `MEMORY.md` is the persistent state bank. `AGENTS.md` requires agents to conform to these; no duplicate media pipeline rule file exists.
8. **Multi-Asset Output**: A session produces the composite plus available clean 720p webcam, normalized 1080p tab video, standalone mixed audio, processed microphone audio, gained tab audio, and a 24 Hz cursor JSON. The approved cursor architecture supports exactly one extension-selected Chromium tab per session; that single selection supplies tab video, tab audio, and cursor events. Existing Electron cursor code is legacy until the extension replacement is verified.

---

## 3. Environment & Configuration State

* **Node.js**: `v26.7.0` | **npm**: `11.19.0`
* **Local Secrets File**: `.env.local` (ignored by Git)
  * `DATABASE_URL`: Neon pooled Postgres connection string (`postgresql://...pooler...neon.tech/neondb?sslmode=require`).
  * `BLOB_READ_WRITE_TOKEN`: Vercel Blob store token (`vercel_blob_rw_...`).
* **Database Schema**:
  * `users` table (id, email, display_name, created_at).
  * `recordings` table (id, **user_id FK**, title, duration_seconds, file_size_bytes, resolution, fps, mime_type, local_id, storage_url, blob_pathname, **is_public**, settings, created_at).
  * `recording_assets` table (id, **recording_id FK**, kind including mixed/microphone/system audio and cursor JSON, storage_url, blob_pathname, mime_type, file_size_bytes, resolution, fps, sample_rate_hz, metadata, created_at).
  * `studio_presets` table (id, **user_id FK**, preset_name, pip_shape, pip_size, pip_position, bg_removal_mode, filters_config, updated_at).
  * `recording_shares` table (recording_id, recipient_user_id, permission, created_at).
  * `schema_migrations` table tracks ordered `psql` migrations.

---

## 4. Current State & Roadmap Progress

- [x] **Requirements Analysis & Architecture Specs**:
  - [x] `docs/requirements_analysis.md`
  - [x] `docs/system_architecture.md` (**Risk mitigations R1-R5 applied**)
  - [x] Synchronized `docs/system_architecture.md` with the implemented repository: actual client/server boundaries, `src/proxy.ts`, current file tree, Route Handler inventory, direct Blob upload flow, request-time share authorization, and open R6 public-Blob exposure
  - [x] `docs/audio_video_pipeline.md`
  - [x] `docs/ui_ux_specification.md`
  - [x] `docs/implementation_roadmap.md`
  - [ ] Deployment/database guide is currently absent from the working tree and should be recreated only if requested.
  - [x] Product recommendations reconciled into the roadmap, requirements analysis, architecture, media pipeline, and UI specification (30-minute active-time limit, dashboard/library, recovery, presets, auth, and sharing scope)
  - [x] Added `docs/output_requirement.md` with the proposed synchronized five-asset session contract, recovery/storage expectations, acceptance criteria, and browser cursor-tracking constraint
- [x] **Agentic Files & Customization Setup**:
  - [x] `AGENTS.md` is the single agent instruction entry point; obsolete `GEMINI.md` was removed
  - [x] `.agents/rules/code_standards.md`
  - [x] `.agents/rules/database_management.md`
  - [x] `.agents/rules/memory_management.md`
  - [x] `.agents/skills/media-pipeline-verifier/SKILL.md`
  - [x] `.agents/skills/canvas-compositor-check/SKILL.md`
  - [x] Consolidated the media/audio/video invariants into the authoritative `docs/audio_video_pipeline.md`; removed the duplicate `.agents/rules/media_audio_video.md`
- [x] **Phase 1 (Scaffolding): Next.js 16 + React 19 + TypeScript Setup**:
  - [x] Initialized Next.js App Router with TypeScript and Turbopack
  - [x] Installed `@neondatabase/serverless`, `@vercel/blob`, `idb-keyval`, `fix-webm-duration`
  - [x] Defined TypeScript types (`types/media.ts`, `types/recording.ts`, `types/database.ts`)
  - [x] Created database client (`lib/db.ts`), IndexedDB helper (`lib/idb.ts`), EBML duration patcher (`lib/ebmlPatcher.ts`)
  - [x] Created Next.js Route Handlers (`api/upload`, `api/recordings`, `api/presets`)
  - [x] Added the `psql` migration runner, npm/VS Code tasks, and versioned SQL migrations (`scripts/db-migrate.mjs`, `database/migrations/`)
  - [x] Applied and verified `0001_user_owned_recordings` against Neon; repeat runs are idempotent
  - [x] Integrated Clerk provider, Proxy, sign-in/sign-up pages, server session helper, and verified webhook Route Handler
  - [x] Added `CLERK_WEBHOOK_SIGNING_SECRET` and registered the Clerk webhook for user synchronization
  - [x] Verified zero TypeScript compilation errors with `npm run build`
- [x] **Initial Studio UI Test Harness**:
  - [x] Replaced the default `src/app/page.tsx` template with `<StudioShell />` and switched `src/app/globals.css` to dark studio tokens (`#080b12` / `#f4f5f8`, Geist font)
  - [x] Added `src/components/studio/StudioShell.tsx` + `StudioShell.module.css`: authenticated dark studio shell with capture mode, camera, audio, and resolution controls
  - [x] Added simulated countdown, record, pause, review, and 30-minute limit states with keyboard shortcuts (Space, Alt+S/M/C)
  - [x] Added auth-gated `src/app/api/health/route.ts` (Clerk session + Neon `SELECT 1` + Blob token presence) consumed by the UI system-check panel
  - [x] Added service health checks for Clerk, Neon, Vercel Blob configuration, and browser media capabilities
  - [x] Connected preset save/load and recording library inspection to the existing authenticated APIs
  - [x] Added a persisted light/dark theme switch with system-preference initialization and accessible theme tokens
  - [x] Replaced simulated recording controls with the real recording-session hook
- [ ] **Housekeeping**: `src/app/page.module.css` is now unused dead code (page renders `StudioShell`) and should be deleted.
- [x] **Phase 1 (Media Hooks): `useMediaDevices` Implementation**:
  - [x] Added screen, camera, microphone, and browser-supported system-audio acquisition with 30 FPS video constraints
  - [x] Added device enumeration/hot-plug refresh, user-friendly permission/device errors, and external screen-share `ended` handling
  - [x] Added strict replacement, disconnect, and unmount cleanup with `track.stop()`
  - [x] Connected source selection, readiness states, system-audio detection, and live screen/camera previews to `StudioShell`
  - [x] Lifted raw stream ownership into a root `MediaSessionProvider` and added an adaptive global control for disconnecting screen, camera, microphone, or all sources from every route
  - [x] Made the global active-device control draggable, keyboard-movable, viewport-clamped, and position-persistent so it cannot permanently cover page actions
- [x] **Phase 2: 30 FPS Canvas Compositor Engine (`useCanvasCompositor`)**:
  - [x] Added delta-clamped 30 FPS canvas rendering with 720p/1080p 16:9 output and contained screen fitting
  - [x] Added screen-only, webcam-only, and screen-plus-PiP composition into one `canvas.captureStream(30)` visual stream
  - [x] Added circular/rounded PiP masks, 160/240/320px scaled sizes, four anchor presets, clamped pointer dragging, and keyboard nudging
  - [x] Added development FPS diagnostics, paused/no-source render suspension, generated-stream cleanup, and a Phase 4 cutout fallback warning
  - [x] Connected the composited canvas, position controls, live FPS, and stream readiness to `StudioShell`
  - [x] Replaced foreground-only canvas/inference scheduling with a visibility-aware RAF/Web Worker clock so background browser tabs continue producing composite, webcam, screen, and segmentation frames
- [x] **Phase 3: Web Audio DSP Pipeline & VU Meter (`useAudioDSP`)**:
  - [x] Added the microphone chain: 80Hz high-pass, 2.8kHz/+4dB presence EQ, 12kHz low-pass, -24dB/4:1 compressor, and smooth noise gate
  - [x] Mixed browser-supported system audio through an independent gain path so vocal filters affect only the microphone
  - [x] Added Natural, Voice Clarity, Noise Reduction, Podcast, and configurable Custom presets with smoothed live parameter changes
  - [x] Added autoplay-safe context resume, click-free mute/gain changes, system volume, mixed-output VU metering, and one destination audio stream
  - [x] Added complete node disconnection, animation-frame cancellation, generated-track cleanup, and `AudioContext.close()` teardown
  - [x] Connected DSP controls, state, errors, meter, and mixed-track readiness to `StudioShell`
- [x] **Phase 4: MediaPipe AI Background Segmentation (`useVisionSegmentation`)**
  - [x] Declared and locked `@mediapipe/selfie_segmentation@0.1.1675465747` as a production dependency so clean Vercel installs resolve the runtime and bundled TypeScript declarations
  - [x] Connected the 256px MediaPipe effect canvas to webcam-only and PiP compositor paths with visible inference/error diagnostics
- [x] **Phase 5: Recording Lifecycle, Pause/Resume & 30-Min Limit (`useRecordingSession`)**
  - [x] Replaced UI simulation with the real composited-video/mixed-audio MediaRecorder lifecycle, active-time timer, pause/resume, warnings, and hard stop
  - [x] Added MP4/AVC preference where supported with WebM fallback and kept the live canvas preview rendering while recording is paused
  - [x] Added one coordinated multi-recorder session for composite, normalized 720p webcam, normalized 1080p screen, and standalone processed audio outputs
- [x] **Phase 6: WebM Duration Fixer & Local Export / IndexedDB Integration**
  - [x] Connected finalized recordings to review playback and local download after WebM duration repair
  - [x] Added IndexedDB draft discovery and one-click recovery into a repaired, locally persisted recording
  - [x] Checkpointed chunks by asset kind and added independent source-asset recovery and download controls
  - [x] Added the legacy Electron display cursor prototype at 24 Hz, normalized active-time JSON finalization, local IndexedDB persistence, download, and Review/Library path visualization
  - [x] Implemented the one-selection Manifest V3 tab capture and cursor extension, one-use stream bridge, provider-owned tab video/audio, 24 Hz active-time cursor lifecycle, and extension-tab audio monitoring; unpacked-extension runtime verification remains pending
- [x] **Phase 7: Studio React UI & Dark Glassmorphism Styling**
  - [x] Implemented the preview-first Studio layout: collapsible Sources/Effects panels, tabbed effect controls, sticky recording dock, dedicated review workspace, and on-demand diagnostics drawer
  - [x] Corrected the default Studio grid so the preview remains the primary left column and Sources/Effects align at the top of a single right inspector rail; viewports at or below 1120px use overlay drawers
  - [x] Added responsive desktop/tablet/mobile panel behavior while preserving adaptive light/dark theme tokens and Vanilla CSS Modules
  - [x] Connected recording/recovery status, real preview, download, upload progress, and publish/share actions to the review workspace
  - [x] Added functional Dashboard, Library, and Settings routes with shared navigation, responsive light/dark styling, quick starts, preset launch/delete, local/cloud/shared recording filters, playback, scoped deletion, diagnostics, and local storage visibility
  - [x] Added owner sharing controls that resolve registered recipients by email, grant `viewer` or `viewer_download`, list recipients, and revoke access
  - [x] Added a reusable recorded-audio review player that decodes the finalized standalone audio Blob into an amplitude waveform with synchronized playback and click-to-seek controls; the live VU analyser remains separate
  - [x] Persisted 120 normalized recorded-audio waveform peaks in IndexedDB and Neon JSON metadata, and added compact waveform playback/seek controls to local, owned-cloud, and accessible shared Library cards; legacy recordings retain decode fallback
  - [x] Added separate microphone/system live meters, compact/collapsible recording meters, optional source-audio recording assets, and expandable mixed/source waveform review
  - [x] Added an interactive cursor trajectory timeline player for local and cloud Library assets with play/pause, seek, playback speed, interpolated motion, and recent-trail visualization; JSON remains the only persisted cursor asset
- [ ] **Phase 8: Neon DB & Vercel Blob Integration Testing**
  - [x] Implemented authenticated direct browser-to-Vercel-Blob multipart upload followed by user-owned Neon metadata creation
  - [x] Applied and verified migration `0002_recording_assets`; multi-asset uploads create separate Blob objects and child metadata rows
  - [x] Applied and verified migration `0003_source_audio_assets`; Neon accepts `microphone-audio` and `system-audio` child assets
  - [x] Applied and verified migration `0004_cursor_asset`; cloud save uploads cursor JSON directly to Blob and stores its child metadata row
  - [x] Added a request-time authorized `/share/[recordingId]` page for public, owner, `viewer`, and `viewer_download` access
  - [x] Verified the live Neon migration status and schema with `npm run db:status` and `npm run db:verify`
  - [x] Added a Chromium Playwright E2E harness with fake camera/microphone devices, local/deployed base URL support, and an anonymous sign-in smoke test
  - [ ] Run an authenticated browser upload/playback test against the connected Vercel Blob store
- [ ] **Phase 9: Vercel Deployment & Verification**
- [x] **Hooks Maintainability Refactor**:
  - [x] Refactored all `src/hooks` modules around shared browser-media helpers, declarative DSP presets, isolated canvas/segmentation rendering, and clearer multi-asset recorder construction/finalization while preserving public hook contracts and pipeline invariants
  - [x] Verified the refactor with zero-warning lint, a successful Next.js production build, and static media/compositor lifecycle audits; real-device runtime validation remains part of the next step

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
| **Noise Gate Step Change** | Audible clicking/popping artifacts | Use `gainNode.gain.setTargetAtTime()` with 10ms attack / 100ms release — never `gain.value = 0`. |
| **Safari WebM Playback** | Shared videos fail to play in Safari/iOS | Detect MP4/AVC support at session start; prefer `video/mp4` if available; show compatibility notice on `/share/` page. |
| **A/V Desync over Long Sessions** | Audio and video drift out of sync after ~15 min | Use delta-clamped RAF timer; enforce 30-min hard stop; UI warns at 15 min. |
| **Neon Schema Drift** | Application code can fail when a schema change is deployed without its migration | Add a new ordered SQL file, run `npm run db:status`, `npm run db:migrate`, and `npm run db:verify`; never edit an applied migration. Initial schema was applied on 2026-10-10. |
| **Conditional Canvas Mount** | Calling `captureStream()` before the source-driven preview canvas mounts produces no output stream | Reinitialize canvas capture when visual-source availability changes; the compositor owns and stops only its generated track. |
| **Extraneous MediaPipe Package** | Local builds may resolve `@mediapipe/selfie_segmentation` from `node_modules` while clean Vercel builds fail with TS2307 | Keep the exact MediaPipe package version declared in both `package.json` and `package-lock.json`; verify with `npm ls` and `npm run build`. |
| **Public Blob URL vs Page Authorization** | The share page enforces owner/public/direct-recipient access, but anyone who obtains the underlying URL can fetch an object from a public Blob store | Treat public-link publishing as intentional exposure; migrate to a private Blob store plus an authorized delivery endpoint before handling sensitive recordings. |
| **Clerk Dev Proxy Origin** | Playwright requests through `127.0.0.1` can trigger Clerk development-proxy socket resets | Use `http://localhost:3000` consistently for the Playwright base URL and local web server. |
| **Blob Store Access Mismatch** | If the client `access` option differs from the connected Blob store mode, uploads can remain at 0% and no metadata request is sent | Keep the current MVP store and client set to `public`. Private storage would also require an authenticated delivery route or short-lived signed URLs. |
| **Blob MIME Allowlist Mismatch** | `MediaRecorder` reports codec-qualified MIME values such as `video/mp4;codecs=avc1,mp4a.40.2`, while the upload token permits base types | Normalize only the Blob upload `contentType` to `video/mp4` or `video/webm`; retain the codec-qualified MIME value in recording metadata. |
| **Concurrent Encoder Load** | Composite, webcam, and screen encoding can saturate low-power devices and cause dropped frames | Keep one video track per recorder, use fixed-rate normalization canvases, expose partial results, and validate real 30-minute sessions on target hardware. |
| **Background-Tab RAF Suspension** | Switching to another browser tab pauses `requestAnimationFrame`, freezing canvas-derived composite, screen, and webcam frames while audio continues | Use `src/lib/frameScheduler.ts`: RAF in visible tabs and a worker timer while `document.hidden`; retain delta clamping and test target browsers. Full browser/OS process suspension remains outside webpage control. |
| **Native Picker/Extension Identity Gap** | A webpage cannot obtain the tab ID selected in `getDisplayMedia()`, so a second cursor selection can silently target the wrong tab | In extension mode, let one Manifest V3 action select the tab, inject the cursor tracker, and provide the same tab's `tabCapture` video/audio stream ID. Do not open a second picker. |
| **One-Use Tab Stream ID** | A `chrome.tabCapture` stream ID expires quickly and can only be consumed once | Keep the RecordWeb bridge connected, issue the ID only after the consumer tab is known, and call `getUserMedia()` immediately; require another extension click after failure or expiry. |
| **Captured Tab Audio Playback** | Chromium can suppress a tab's normal local audio while `tabCapture` is active | For extension-tab capture only, route the gained system-audio branch to `AudioContext.destination`; native display capture remains unmonitored to avoid feedback. |
| **Blank Webcam During Segmentation Startup** | MediaPipe publishes its output canvas before the first result, so drawing that blank canvas hides an otherwise-ready webcam | Pass the effect canvas to the compositor only while segmentation state is `running`; use the raw webcam during loading or error states. |
| **Optional-Chaining Null Comparison** | `captureSession?.timer !== null` evaluates true when `captureSession` is null because the expression yields `undefined`, then a direct `.timer` read crashes the first cursor start | Use the nullish check `captureSession?.timer != null`; the Electron smoke test calls reset twice before initialization to protect idempotent cleanup. |

---

## 6. Immediate Next Steps

1. Load `extension/` unpacked in Chrome/Arc and runtime-test pairing, one-use stream consumption, cursor start/pause/resume/stop, tab closure/navigation, local audio playback, and global disconnect cleanup.
2. Run an authenticated multi-asset upload/download test including cursor JSON.
3. After extension parity is verified, remove the deprecated Electron cursor runtime and dependency.

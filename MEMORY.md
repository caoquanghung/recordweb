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
  * **Lossless Segment Remuxing**: Mediabunny for client-side MP4/WebM parsing and encoded-packet merge without transcoding.
  * **Hosting**: Vercel (Next.js Edge CDN + Serverless Route Handlers in `src/app/api/*`).
  * **Cursor Capture Target**: The `extension/` Chromium Manifest V3 package selects one tab once and supplies its video, audio, and 24 Hz cursor samples. Static/build checks pass; unpacked-extension runtime verification is pending. The existing Electron helper is deprecated legacy fallback code.
  * **Extension App Origin**: `extension/manifest.json` is the single source of truth for the canonical production URL through `homepage_url`; the service worker and bridge derive it at runtime. The obsolete options page and `storage` permission were removed. Local development remains allowed on port 3000.

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
4. **Environment-Aware Direct Client Upload to Vercel Blob**:
   * Standard Vercel Serverless Functions have a 4.5MB request body size limit.
   * Video recordings are far larger than the 4.5MB serverless body limit, especially at the 30-minute maximum.
   * Videos **MUST** be uploaded directly from the browser to edge storage through `src/app/api/upload/route.ts`. Every environment prefers `upload()` / `handleUpload()` whenever `BLOB_READ_WRITE_TOKEN` is configured; Vercel OIDC, `BLOB_STORE_ID`, and `BLOB_WEBHOOK_PUBLIC_KEY` provide the `uploadPresigned()` / `handleUploadPresigned()` fallback when the read-write token is absent. At Vercel Function runtime, the OIDC token comes from the `x-vercel-oidc-token` request header rather than `process.env`.
   * Resulting CDN URL is stored in Neon Postgres `recordings.storage_url`.
5. **Resilient Dual Storage**:
   * Local: Immediate direct download as `.webm` (with EBML duration fix in `src/lib/ebmlPatcher.ts`) + automatic IndexedDB session backup (`src/lib/idb.ts`).
   * Cloud: 1-click upload to Vercel Blob with shareable link + metadata in Neon Postgres via `src/app/api/recordings/route.ts`.
6. **UI Standard**: Strictly Vanilla CSS (CSS Modules & custom properties) with adaptive light/dark studio glassmorphism (tokens in `docs/ui_ux_specification.md`). Theme defaults to the OS preference and persists in `localStorage` as `recordweb-theme`. No Tailwind or heavy CSS frameworks.
7. **Documentation Source of Truth**: `docs/system_architecture.md` is a stale legacy snapshot and is not authoritative. Current subsystem boundaries and behavior must be verified from code, types, tests, route contracts, and maintained domain documents. `docs/audio_video_pipeline.md` remains authoritative for the media pipeline; `docs/ui_rebuild_impact_analysis.md` is the maintained UI boundary/risk inventory. `MEMORY.md` is the persistent state bank.
8. **Multi-Asset Output**: A session produces the composite plus available clean 720p webcam, normalized 1080p tab video, standalone mixed audio, processed microphone audio, gained tab audio, and a 24 Hz cursor JSON. The approved cursor architecture supports exactly one extension-selected Chromium tab per session; that single selection supplies tab video, tab audio, and cursor events. Existing Electron cursor code is legacy until the extension replacement is verified.
9. **Cross-Session Lecture Projects**: A lecture is an owned `recording_projects` row with ordered associations to independently finalized `recordings`. Each later recording session creates a new immutable segment; no `MediaRecorder` is resumed after reload. Logical playback derives one global timeline, while optional physical merge copies compatible encoded packets without decode/encode. Source recordings remain intact.
10. **In-App Presentation Recording**: PDF/PPTX presentation mode uses a separate self-tab capture path rather than `CanvasCompositor`. The presentation DOM will contain the rendered slide, raw webcam overlay, and baked custom cursor; `getDisplayMedia()` provides one current-tab video track, while captured tab audio and microphone audio flow through the existing Web Audio graph. Presentation files remain local in the initial implementation, and MediaPipe blur/cutout is not used in this mode.
11. **Client-Side Recording Archives**: Composite and all available separate-source downloads are assembled into one browser-generated ZIP with `client-zip` and never proxied through a Route Handler. Each entry uses `<recording-name>-<component>.<extension>` and the archive uses `<recording-name>-assets.zip`.

---

## 3. Environment & Configuration State

* **Node.js**: `v26.7.0` | **npm**: `11.19.0`
* **Local Secrets File**: `.env.local` (ignored by Git)
  * `DATABASE_URL`: Neon pooled Postgres connection string (`postgresql://...pooler...neon.tech/neondb?sslmode=require`).
  * Blob storage prefers `BLOB_READ_WRITE_TOKEN` in Production, Preview, and local Development. `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN`, and `BLOB_WEBHOOK_PUBLIC_KEY` are optional fallback credentials when the read-write token is unavailable.
* **Database Schema**:
  * `users` table (id, email, display_name, created_at).
  * `recordings` table (id, **user_id FK**, title, duration_seconds, file_size_bytes, resolution, fps, mime_type, local_id, storage_url, blob_pathname, **is_public**, settings, created_at).
  * `recording_assets` table (id, **recording_id FK**, kind including mixed/microphone/system audio and cursor JSON, storage_url, blob_pathname, mime_type, file_size_bytes, resolution, fps, sample_rate_hz, metadata, created_at).
  * `recording_projects` table is defined by pending migration `0005_recording_projects` (owner, title, draft/completed status, locked media profile, settings, optimistic revision, timestamps).
  * `recording_project_segments` table is defined by pending migration `0005_recording_projects` (project-to-finalized-recording association, ordered sequence, inspected media profile). The live Neon schema has not applied `0005` yet.
  * `studio_presets` table (id, **user_id FK**, preset_name, pip_shape, pip_size, pip_position, bg_removal_mode, filters_config, updated_at).
  * `recording_shares` table (recording_id, recipient_user_id, permission, created_at).
  * `schema_migrations` table tracks ordered `psql` migrations.

---

## 4. Current State & Roadmap Progress

- [x] **Requirements Analysis & Architecture Specs**:
  - [x] `docs/requirements_analysis.md`
  - [x] `docs/system_architecture.md` retained as a historical snapshot only; it is no longer an agent source of truth
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
  - [x] Added `figma-to-page` with a strict two-input contract: a node-specific Figma URL and an explicit target route/page; agents must never infer the implementation destination
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
- [x] **UI Housekeeping**: Removed the unused Next.js `src/app/page.module.css`, five unreferenced template SVG assets, and more than 300 lines of obsolete Studio navigation/prototype CSS. `AppNavigation` is now the sole navigation implementation; all custom `use*` hooks remained byte-identical.
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
  - [x] Replaced scattered composite/source downloads with one client-generated ZIP across Review, local/cloud Library, and download-authorized share pages
  - [x] Removed standalone cursor JSON import from Library; cursor visualization now opens only from recording-owned local or cloud assets
  - [x] Added `docs/ui_rebuild_impact_analysis.md` with the current UI file inventory, behavioral coupling map, redesign risk levels, protected boundaries, staged rebuild plan, and regression checklist
  - [x] Added `docs/current_ux_flow.md` with the current authenticated, Studio, Presentation, review, recovery, Library, sharing, and Settings user journeys traced from implemented routes and UI state transitions
  - [x] Refactored the 1,318-line `StudioShell` into a 40-line composition root, a behavior-preserving `useStudioController`, shared Studio configuration/helpers, and focused Header/Sources/Stage/Effects/Review/Diagnostics view modules; lint, production build, and the Chromium auth smoke test pass
  - [x] Standardized the two-phase Figma workflow with `analyze-ui-design` for versioned evidence/spec handoff and `react-ui-implementer` for readiness-gated Vanilla CSS implementation with protected-hook integrity checks
  - [x] Added a Figma-reconstructed 288 px `AppSidebar` with explicit `fixed` and responsive `adaptive` behaviors, dynamic route state, Clerk-backed user controls, and the `/component/sidebar` showcase; existing routes and media hooks remain unchanged
  - [x] Reconstructed `/dashboard` from Figma node `9:534`, reused the existing adaptive `AppSidebar`, preserved recovery/quick-start/preset/recent-recording behavior, and stored exact design assets locally; lint and the production build pass, while authenticated browser screenshot QA remains pending because no browser surface was available
- [ ] **Phase 8: Neon DB & Vercel Blob Integration Testing**
  - [x] Implemented authenticated direct browser-to-Vercel-Blob multipart upload followed by user-owned Neon metadata creation
  - [x] Centralize Blob authentication with read-write-token priority in every environment and OIDC-backed presigned upload fallback, including matching health checks and delete credentials
  - [x] Applied and verified migration `0002_recording_assets`; multi-asset uploads create separate Blob objects and child metadata rows
  - [x] Applied and verified migration `0003_source_audio_assets`; Neon accepts `microphone-audio` and `system-audio` child assets
  - [x] Applied and verified migration `0004_cursor_asset`; cloud save uploads cursor JSON directly to Blob and stores its child metadata row
  - [x] Added a request-time authorized `/share/[recordingId]` page for public, owner, `viewer`, and `viewer_download` access
  - [x] Verified the live Neon migration status and schema with `npm run db:status` and `npm run db:verify`
  - [x] Added a Chromium Playwright E2E harness with fake camera/microphone devices, local/deployed base URL support, and an anonymous sign-in smoke test
  - [ ] Run an authenticated browser upload/playback test against the connected Vercel Blob store
- [ ] **Cross-Session Recording Projects**:
  - [x] Added project/segment contracts, pure playlist timeline and seek mapping, strict media-profile validation, and typed client calls without changing the UI
  - [x] Added authenticated project and segment Route Handlers with ownership checks, draft/completed lifecycle, optimistic revisions, atomic reordering, and non-destructive detach/delete behavior
  - [x] Added Mediabunny-based MP4/WebM finalized-segment inspection and lossless packet-copy merge with timestamp shifting, abort, progress, and explicit incompatibility errors
  - [x] Added `docs/recording_project_modules.md` and synchronized the architecture and media-pipeline specifications
  - [ ] Apply and verify pending migration `0005_recording_projects` in the intended Neon environment
  - [ ] Runtime-test logical playback and lossless merge with real same-profile MP4 and WebM RecordWeb outputs before connecting project UI
- [ ] **Phase 9: Vercel Deployment & Verification**
- [x] **Hooks Maintainability Refactor**:
  - [x] Refactored all `src/hooks` modules around shared browser-media helpers, declarative DSP presets, isolated canvas/segmentation rendering, and clearer multi-asset recorder construction/finalization while preserving public hook contracts and pipeline invariants
  - [x] Verified the refactor with zero-warning lint, a successful Next.js production build, and static media/compositor lifecycle audits; real-device runtime validation remains part of the next step
- [ ] **In-App Presentation Recording**:
  - [x] Added local PDF/PPTX validation and lazy render adapters (`pdfjs-dist`, `pptx-browser`) with 50 MB and 300-page limits
  - [x] Connected the experimental `pptx-browser` player to the visible presentation canvas so Next consumes parsed click groups before changing slides and applies declared slide transitions; PDF navigation remains static
  - [x] Added self-tab capture with current-tab hints, Capture Handle validation, optional Element Capture restriction, tab-audio exposure, and owned-track cleanup
  - [x] Added a direct presentation cursor controller with normalized 24 Hz active-time samples and integrated the dormant presentation source into `useStudioController` / `useRecordingSession`
  - [x] Added the authenticated `/presentation` workspace and navigation tab by reusing the Studio shell/review/diagnostics UI; its capture root contains only the rendered slide, raw webcam, and custom cursor, with no screen-share or MediaPipe path
  - [x] Added clean full-tab fallback mode, local PDF/PPTX file controls, slide navigation, presentation-specific device controls, and recording startup from the browser's explicit “This Tab” picker
  - [ ] Runtime-test PDF/PPTX fidelity, current-tab selection, Element Capture fallback, tab audio, raw webcam, cursor baking, pause/resume, and finalized output in Chrome/Edge

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
| **Blob Credential Priority** | `handleUpload()` only understands a read-write token, while OIDC-only stores require the presigned upload path; additionally, Vercel Functions deliver the runtime OIDC token through `x-vercel-oidc-token`, so reading only `process.env.VERCEL_OIDC_TOKEN` fails on deployed functions | Prefer `BLOB_READ_WRITE_TOKEN` in every environment. Only fall back to presigned uploads with `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` when it is absent, and resolve OIDC from the request header with an environment fallback for build/local; never expose credentials to the browser. |
| **Concurrent Encoder Load** | Composite, webcam, and screen encoding can saturate low-power devices and cause dropped frames | Keep one video track per recorder, use fixed-rate normalization canvases, expose partial results, and validate real 30-minute sessions on target hardware. |
| **Background-Tab RAF Suspension** | Switching to another browser tab pauses `requestAnimationFrame`, freezing canvas-derived composite, screen, and webcam frames while audio continues | Use `src/lib/frameScheduler.ts`: RAF in visible tabs and a worker timer while `document.hidden`; retain delta clamping and test target browsers. Full browser/OS process suspension remains outside webpage control. |
| **Native Picker/Extension Identity Gap** | A webpage cannot obtain the tab ID selected in `getDisplayMedia()`, so a second cursor selection can silently target the wrong tab | In extension mode, let one Manifest V3 action select the tab, inject the cursor tracker, and provide the same tab's `tabCapture` video/audio stream ID. Do not open a second picker. |
| **One-Use Tab Stream ID** | A `chrome.tabCapture` stream ID expires quickly and can only be consumed once | Keep the RecordWeb bridge connected, issue the ID only after the consumer tab is known, and call `getUserMedia()` immediately; require another extension click after failure or expiry. |
| **Captured Tab Audio Playback** | Chromium can suppress a tab's normal local audio while `tabCapture` is active | For extension-tab capture only, route the gained system-audio branch to `AudioContext.destination`; native display capture remains unmonitored to avoid feedback. |
| **Blank Webcam During Segmentation Startup** | MediaPipe publishes its output canvas before the first result, so drawing that blank canvas hides an otherwise-ready webcam | Pass the effect canvas to the compositor only while segmentation state is `running`; use the raw webcam during loading or error states. |
| **Optional-Chaining Null Comparison** | `captureSession?.timer !== null` evaluates true when `captureSession` is null because the expression yields `undefined`, then a direct `.timer` read crashes the first cursor start | Use the nullish check `captureSession?.timer != null`; the Electron smoke test calls reset twice before initialization to protect idempotent cleanup. |
| **Extension Capture Survives Recording Stop** | `useRecordingSession.stop()` stops MediaRecorders and cursor sampling only; it does not call `tabCapture.disconnect()` or stop the provider-owned tab tracks, so the tab-capture indicator/audio monitor and `ON` badge can remain active after finalization | Treat recording stop and source disconnect as separate current behaviors. Add an explicit post-finalization extension cleanup that sends `DISCONNECT` and calls the provider's `stopScreen()` without interrupting recorder finalization. |
| **Stale Extension Target After App Port Loss** | Closing or reloading the RecordWeb tab only removes its port from `appPorts`; `currentTargetTabId` and the target badge remain until an explicit disconnect or tracker loss, potentially blocking selection of another tab | On app-port disconnect, clear the paired target/badge and notify/reset the tracker when no RecordWeb consumer remains. Runtime-test reload and tab-close recovery. |
| **Dormant Tracker Context Survives Disconnect** | `tracker-content.js` handles `DISCONNECT` with `resetSampler()` only. Its pointer/blur listeners, closure, injected-world flag, and long-lived runtime port remain attached to the target document until navigation or tab close. This is a real lifecycle leak, though by itself it is unlikely to explain extreme CPU/RAM use; a still-active tab capture or the target page workload must also be ruled out | Add an idempotent teardown that clears the timer, removes listeners, disconnects the port, and permits clean reinjection. Use Chrome Task Manager and `chrome://webrtc-internals` to distinguish target-page, extension, GPU, and live-capture costs. |
| **Finalized Recording Retains Source Chunks** | `useRecordingSession.finalizeSession()` builds repaired per-asset Blobs and stores them in React state/IndexedDB but leaves every original one-second Blob in `chunksRef`; the review state also intentionally retains all composite/source/audio Blobs and a preview object URL. Long multi-asset recordings can therefore retain substantially more renderer memory than the exported file size until reset or tab close | After successful persistence and pending draft completion, clear chunk/spec/recorder refs while retaining only the review assets that the UI still needs. Profile heap and native/GPU memory separately because Blob backing storage is not fully represented by JS heap. |
| **IndexedDB Checkpoint Write Amplification** | Every non-empty one-second chunk from every active recorder invokes `checkpointDraft()`, and each queued checkpoint rewrites a snapshot containing the complete accumulated chunk arrays for every asset. With up to six recorders this can cause several ever-growing full IndexedDB writes per second and near-quadratic total I/O over a long session | Coalesce/debounce checkpoints to one bounded-frequency writer, avoid enqueuing redundant snapshots, and persist only newly produced chunks or use a normalized per-session/per-asset chunk store. Measure write throughput and queue depth during long recordings. |
| **Studio Eagerly Loads Full Recovery Drafts** | Studio mount calls `getRecordingDrafts()`, which deserializes every draft including every stored media `Blob[]`, then keeps the complete drafts in React state even before a recording session starts. Old or interrupted multi-asset sessions can therefore cause high baseline renderer memory | Add a lightweight draft-index query that returns metadata only; load one draft's chunks lazily when the user explicitly starts recovery. Provide stale-draft size visibility and deletion controls. |
| **Preview Pipeline Runs Before Recording** | Connecting sources immediately activates the 30 FPS composite canvas, Web Audio graph/meter RAF, and—by default because the Studio starts in `screen-pip` + `blur`—MediaPipe inference. These costs are tied to source availability rather than recording status, so setup mode can already consume significant CPU/GPU memory | Introduce explicit preview activity/quality control: low-rate or lower-resolution idle preview, suspend inference/audio metering when panels are hidden or sources are inactive, and raise to recording quality only during countdown/recording. |
| **Merged Output Memory Cost** | `segmentMerger.ts` currently writes the complete remuxed MP4/WebM to a Mediabunny `BufferTarget`, so a long lecture requires memory for the output plus bounded input caches | Keep merge optional, retain immutable source segments, show resource guidance in the future UI, and add File System Access or append-only streaming output before targeting very large lectures. |
| **Same MIME Is Not Merge Compatibility** | Independently finalized files can share a MIME string while differing in codec configuration, resolution, audio layout, or key-frame boundaries | Inspect every Blob with Mediabunny and compare the stored immutable media profile; reject mismatches and never silently transcode. |
| **Self-Tab Capture Is Permission-Gated** | `preferCurrentTab` only promotes “This Tab”; it cannot silently select it, and unsupported browsers may not expose Capture Handle or Element Capture | Start capture from a user gesture, reject reported non-tab surfaces, verify the capture handle when available, and use clean full-tab presenter mode only as the explicit fallback. |
| **Source Release Can Invalidate Review Preview** | Releasing presentation capture after finalization changes the live cursor-controller prop. If recorder cleanup depends on that prop, React runs the cleanup and revokes the freshly created preview Object URL, leaving Review black at `0:00` even though the IndexedDB Blob is valid | Pin the cursor controller per recording session in `useRecordingSession`; keep unmount cleanup independent of live controller identity, and revoke preview URLs only on replacement, explicit reset, or actual unmount. |
| **Presentation Deck Outlives Recording Reset** | Recording state and the locally rendered PDF/PPTX deck have separate owners, so resetting Review alone can carry the previous lecture file into the next session | On “Record another” in the Presentation workspace, call `presentationDeck.clear()` so the renderer is disposed, pending renders are invalidated, and the upload state returns to idle. |
| **PPTX Browser Font Substitution** | `pptx-browser` may request mapped Google Fonts and cannot guarantee PowerPoint-perfect charts, SmartArt, embedded media, or typography | Keep the file itself local, pin the renderer version, surface fidelity limitations in the future UI, and runtime-test representative decks before expanding the supported feature claim. |
| **PPTX Player Is Experimental** | `pptx-browser@4.1.5` exposes click-group and transition playback, but its object-animation compositor does not yet render each shape independently, so parsed entrance/exit/emphasis effects may remain visually static | Treat the integration as a runtime experiment, advertise only verified transitions, and test representative animated decks before deciding whether to fork the renderer or move processing to a dedicated presentation engine. |

---

## 6. Immediate Next Steps

1. Runtime-test `/presentation` with representative PDF/PPTX files in authenticated Chrome/Edge: current-tab selection, Element Capture and clean fallback, tab audio, raw webcam, cursor baking, pause/resume, cleanup, and finalized output.
2. Fix extension cleanup so recording completion releases the captured tab and app-port loss clears stale target state; then runtime-test the unpacked extension lifecycle.
3. Run an authenticated multi-asset upload/download test including cursor JSON.
4. Apply migration `0005_recording_projects`, then runtime-test authenticated cross-day segment attachment, ordering, continuous playback, and lossless MP4/WebM merge before adding project UI.

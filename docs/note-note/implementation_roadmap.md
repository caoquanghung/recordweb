# RecordWeb Implementation Roadmap & Release Plan

## 1. Product Goal

RecordWeb is a privacy-first browser recording studio for laptop users. It records screen, webcam, microphone, and supported system audio; combines them into one 30 FPS video; enhances camera and microphone input locally; protects unfinished recordings; and uploads only when the user explicitly requests cloud sharing.

The primary user journey is:

1. Sign in and open the dashboard.
2. Start a new recording or load a saved preset.
3. Select screen, camera, microphone, system audio, and effects.
4. Record, pause, resume, mute, and stop within a 30-minute active-time limit.
5. Review and download the repaired recording locally.
6. Optionally upload it and share it with a public link or selected users.

## 2. Release Scope

### 2.1 MVP — Reliable Recording

The MVP is complete when a user can:

- Register, sign in, and access only their own cloud data.
- Record screen-only, webcam-only, or screen with webcam PiP.
- Capture microphone and browser-supported system audio.
- See a live 16:9 preview composited at 30 FPS.
- Drag, resize, show, or hide the webcam overlay.
- Pause, resume, mute, and stop without generating separate output files.
- Record for up to 30 minutes of active recording time.
- Apply basic voice enhancement and view a live VU meter.
- Use original, blurred, or removed webcam backgrounds.
- Recover completed chunks after an accidental refresh or crash.
- Preview and download a seekable WebM or supported MP4 file.
- Save and load personal studio presets.
- Upload directly to Vercel Blob and create a shareable link.
- View, rename, share, download, and delete recordings from a library.

### 2.2 Post-MVP — Editing and Collaboration

These features must not delay the reliable-recording MVP:

- Non-destructive start/end trimming.
- Cursor spotlight and click visualization.
- Recording-time timeline markers.
- On-canvas annotations.
- Comments, reactions, and viewing analytics.
- Expiring links and granular sharing permissions.
- Cloud transcoding for universal playback.

## 3. Technology Baseline

| Layer | Technology | Constraint |
| :--- | :--- | :--- |
| Application | Next.js App Router, React 19, TypeScript | Browser media APIs stay inside client components and hooks. |
| Styling | Vanilla CSS, CSS Modules, custom properties | No TailwindCSS; retain the dark studio design system. |
| Video | Canvas 2D with optional WebGL/OffscreenCanvas upgrades | Produce one 16:9 composited stream at 30 FPS. |
| Vision | MediaPipe Selfie Segmentation | Run locally on a downscaled inference surface. |
| Audio | Web Audio API | Keep microphone DSP separate from the system-audio path. |
| Recording | MediaStream and MediaRecorder | Use one composited video track and one mixed audio track. |
| Local persistence | IndexedDB and `fix-webm-duration` | Cache chunks and repair WebM before download. |
| Cloud storage | Vercel Blob client uploads | Never proxy video bodies through a Route Handler. |
| Metadata | Neon Serverless Postgres | All queries are authenticated and scoped by `user_id`. |
| Hosting | Vercel with GitHub integration | Pull requests receive previews; `main` deploys to production. |

## 4. Current Repository Baseline

Status as of October 10, 2026:

- [x] Next.js, React, TypeScript, lint, and build scaffolding.
- [x] Shared media, recording, and database type definitions.
- [x] Neon client wrapper.
- [x] IndexedDB and WebM-duration helper foundations.
- [x] Auth-gated API shapes for recordings, presets, and Blob upload tokens.
- [x] Vercel/GitHub and Neon services connected externally.
- [x] Clerk SDK, provider, Next.js 16 Proxy, sign-in/sign-up routes, and server session lookup.
- [ ] Clerk webhook signing secret and production webhook registration for Neon user synchronization.
- [ ] Versioned database migrations matching the application schema.
- [ ] Media hooks and studio components.
- [ ] Dashboard, library, review, and public sharing pages.
- [ ] Automated test workflow and protected release checks.

## 5. Delivery Phases

### Phase 0 — Cloud Foundation, Authentication, and CI

**Outcome:** every preview builds consistently, production secrets are available, and cloud routes have real user identity.

- Configure Clerk development and production instances and environment variables.
- Add login, registration, logout, session loading, and protected application routes.
- Register and verify the Clerk-to-Neon user synchronization webhook.
- Add an idempotent user synchronization flow for the Neon `users` table.
- Add versioned SQL migrations for `users`, `recordings`, `studio_presets`, and indexes.
- Connect Vercel Blob to the Vercel project and expose its token only to server code.
- Configure Production, Preview, and Development environment variables separately.
- Add GitHub Actions for `npm run lint` and `npm run build`.
- Require successful checks before merging into `main`.
- Replace the in-memory upload limiter with a durable limiter before public launch.

**Exit criteria:** an authenticated preview deployment can create a user, call every protected API, read/write a preview database safely, and request a constrained Blob upload token.

### Phase 1 — Media Acquisition and Device Safety

**Outcome:** users can select and preview sources without leaving hardware locked.

- Implement `useMediaDevices` for display, camera, microphone, and system-audio tracks.
- Enumerate devices after permission is granted and handle device changes.
- Support screen-only, webcam-only, and screen-plus-PiP modes.
- Detect missing system audio and explain browser/OS limitations.
- Handle denied permissions and `track.onended` events.
- Stop replaced or unmounted tracks with `track.stop()`.
- Add a preflight panel showing source readiness and browser compatibility.

**Exit criteria:** repeated source switching does not leak tracks, retain camera lights, or crash the preview.

### Phase 2 — 30 FPS Canvas Compositor

**Outcome:** all visual sources become one stable 16:9 video track.

- Implement `useCanvasCompositor` with a delta-clamped `requestAnimationFrame` loop.
- Support 1080p and 720p output while preserving a 16:9 canvas.
- Fit non-16:9 screens with letterboxing or pillarboxing.
- Add webcam circle and rounded-rectangle masks.
- Add clamped drag and resize behavior with keyboard-accessible position presets.
- Export the result through `canvas.captureStream(30)`.
- Add an FPS diagnostic overlay available in development mode.

**Exit criteria:** the compositor maintains 30 FPS ±1 under the supported baseline workload and never records separate visual tracks.

### Phase 3 — Audio Mixing, Enhancement, and Metering

**Outcome:** microphone and system audio form one clean mixed audio track.

- Implement `useAudioDSP` and resume `AudioContext` from a user gesture.
- Build the required microphone chain: gain, high-pass, presence EQ, low-pass, compressor, and smooth noise gate.
- Route system audio through a separate gain node directly into the master destination.
- Add Natural, Voice Clarity, Noise Reduction, Podcast, and Custom modes.
- Add microphone mute, system-audio volume, live test, and VU meter.
- Disconnect nodes and close unused contexts during teardown.

**Exit criteria:** mute and filter changes are click-free, VU readings remain responsive, and system audio is not altered by vocal filters.

### Phase 4 — Recording Lifecycle and 30-Minute Guardrail

**Outcome:** one valid recording survives pause/resume and stops safely.

- Implement the session state machine: idle, configuring, countdown, recording, paused, finalizing, ready, and error.
- Combine the canvas video track with the Web Audio destination track.
- Select the best supported MIME type at runtime.
- Start `MediaRecorder` with a 1-second chunk timeslice.
- Use `MediaRecorder.pause()` and `resume()` while keeping preview systems alive.
- Track active recording time separately from wall-clock and paused time.
- Warn at 15 minutes and again with 60 seconds remaining.
- Stop and finalize at exactly 30 minutes of active recording time.
- Handle screen-share termination, device loss, and encoder errors without losing completed chunks.

**Exit criteria:** repeated pause/resume cycles produce one playable file with correct active duration and acceptable A/V sync.

### Phase 5 — Local Recovery, Repair, and Review

**Outcome:** users do not lose a completed or partially completed session and can download a seekable result.

- Persist chunk checkpoints and session metadata to IndexedDB during recording.
- Detect incomplete sessions on startup and present a recovery action.
- Assemble the final Blob and repair WebM duration metadata.
- Release temporary object URLs when previews change or close.
- Build the review experience with title, duration, resolution, FPS, size, and storage status.
- Add standard browser download and progressive File System Access saving.
- Add explicit discard confirmation and storage-quota error handling.

**Exit criteria:** a forced refresh during a test recording leaves recoverable data, and downloaded WebM files seek from start to finish.

### Phase 6 — Background Effects and Performance Adaptation

**Outcome:** camera effects remain useful without destabilizing recording.

- Implement `useVisionSegmentation` using a downscaled inference canvas.
- Add Original, Blur, and Transparent Cutout modes.
- Feather mask edges and cache the most recent valid mask.
- Decouple segmentation cadence from the 30 FPS compositor.
- Automatically reduce inference frequency when frame time exceeds budget.
- Disable effects gracefully after repeated WebGL/WASM failures.

**Exit criteria:** background effects do not reduce captured canvas output below the agreed frame-rate tolerance on the supported test laptop.

### Phase 7 — Presets, Dashboard, and Recording Library

**Outcome:** returning users can start quickly and manage their work.

- Build dashboard, recording setup, studio, review, and library routes/components.
- Save device preferences by stable device identifier when permitted.
- Save layout, resolution, background mode, audio mode, and system-audio preference as presets.
- Provide built-in presets for Presentation, Coding Tutorial, Webcam Message, Product Demo, and Online Lecture.
- Add library filters for Mine, Shared with Me, Local Only, and Cloud.
- Add rename and delete flows with ownership checks.
- Keep local and cloud status visually distinct.

**Exit criteria:** presets round-trip through Neon and library actions cannot access another user's private records.

### Phase 8 — Cloud Upload and Sharing

**Outcome:** users explicitly upload a recording and control who can view it.

- Upload repaired video directly from the browser through `@vercel/blob/client`.
- Show upload progress, cancellation, retry, and offline states.
- Save Blob URL, pathname, MIME type, and recording metadata in Neon only after upload success.
- Implement `/share/[recordingId]` with server-side authorization checks.
- Support private-by-default recordings and an explicit public-link toggle.
- Add a first-class `recording_shares` table for user-to-user sharing instead of overloading `is_public`.
- Start with Viewer and Viewer-with-download roles; defer Editor until editing exists.
- Delete the Blob object and metadata consistently, with retryable cleanup for partial failures.

**Exit criteria:** a private recording cannot be fetched anonymously, a public recording plays from its link, and direct uploads larger than 50 MB never pass through the application server body.

### Phase 9 — Production Hardening and Launch

**Outcome:** RecordWeb is observable, accessible, and safe to release.

- Run Chrome/Edge as the primary support target and document Firefox/Safari degradation.
- Verify camera, microphone, screen-sharing, and system-audio behavior over HTTPS.
- Add accessible names, focus states, reduced-motion behavior, and keyboard operation.
- Add structured client error reporting without recording media or sensitive device details.
- Add storage quotas, upload rate limits, retention behavior, and account deletion handling.
- Review security headers, content policy, Blob visibility, and secret exposure.
- Perform 30-minute soak tests and deployment rollback drills.

**Exit criteria:** all release gates below pass in a production-like Vercel preview.

## 6. Release Gates

| Gate | Required evidence |
| :--- | :--- |
| Build quality | `npm run lint` and `npm run build` pass with zero errors. |
| Media cleanup | Every acquired track stops after reset, replacement, or unmount. |
| Frame stability | Canvas capture remains at 30 FPS ±1 during the baseline scenario. |
| Recording duration | Automatic finalization occurs at 30:00 active time; paused time is excluded. |
| Pause/resume | Ten pause/resume cycles produce one playable recording without frozen output. |
| A/V sync | Drift remains within the agreed tolerance after a 30-minute soak test. |
| Audio | Mute and preset changes introduce no audible clicks or clipping. |
| Recovery | Interrupted chunked sessions are detected and can be recovered or discarded. |
| Export | WebM duration is correct and the complete timeline is seekable. |
| Background effects | Edge feathering is acceptable and model failure degrades to Original mode. |
| Authorization | Cross-user API access, upload-token requests, and private share access are rejected. |
| Upload | A file over 50 MB uploads directly to Blob without a 413 response. |
| Accessibility | Primary recording workflow is keyboard operable and screen-reader labeled. |
| Deployment | PR previews and `main` production deployments use the intended environment variables. |

## 7. Immediate Next Tasks

1. Complete Phase 0: choose the authentication provider, add schema migrations, and configure deployment checks.
2. Implement and verify `useMediaDevices` with complete track cleanup.
3. Implement the 30 FPS compositor before adding recording or AI effects.

## 8. Planning Decisions

- The authoritative maximum is **30 minutes of active recording time**, not five minutes.
- Chrome and Edge on laptops are the primary MVP targets; other browsers receive documented fallbacks.
- Recording and processing remain local until the user explicitly uploads.
- The reliable recording path has priority over trimming, annotations, comments, and analytics.
- Public links and direct user sharing are separate authorization concepts.
- Preview deployments should use isolated Neon branches when practical to avoid production-data contamination.

# RecordWeb Agent Guidelines

This repository contains **RecordWeb**, a high-performance, client-side web recording studio application built with **Next.js (App Router)**, **TypeScript**, and **React**. It captures screen, webcam, and audio with real-time video compositing (Picture-in-Picture, AI background removal), Web Audio DSP filtering, 30 FPS regulation, and local storage export. It persists metadata to **Neon Serverless Postgres**, uploads videos to **Vercel Blob**, and deploys to **Vercel**.

---

## 1. Core Architecture Principles

1. **Client-Side First with React & Hooks**:
   - All recording, compositing, AI segmentation, and audio filtering MUST run entirely within the user's browser using React client components (`"use client"`) and custom hooks.
   - No external video transcoding servers or cloud uploads required for recording.
2. **Unified Compositor Architecture**:
   - Never attempt to record multiple separate video tracks through `MediaRecorder`.
   - Screen and Webcam video feeds must be composited onto an offscreen/visible 16:9 `<canvas>` surface running at a locked **30 FPS**.
   - Recording is executed on `canvas.captureStream(30)` combined with the Web Audio destination node.
3. **Web Audio Graph Integrity**:
   - Microphone and System audio are routed through dedicated Web Audio API nodes (`BiquadFilterNode`, `DynamicsCompressorNode`, `GainNode`, `AnalyserNode`).
   - Clean up `AudioContext` and close media tracks (`track.stop()`) whenever a session resets, devices change, or React components unmount.
4. **Resilient Local & Cloud Persistence**:
   - Recordings must be repaired using client-side EBML patching (`src/lib/ebmlPatcher.ts`) before download to guarantee seekability.
   - Cached locally in IndexedDB (`src/lib/idb.ts`) to prevent accidental loss on page reload.
   - Session metadata and studio presets are persisted to **Neon Serverless Postgres** via Next.js Route Handlers (`src/app/api/*`).
5. **Direct Client-to-Blob Video Uploads**:
   - Cloud uploads must use `@vercel/blob/client` (`upload()`) directly from the browser to Vercel's global blob storage.
   - NEVER buffer multi-megabyte video files through serverless route handler bodies (which triggers the 4.5MB payload limit).
6. **Secure Serverless Edge**:
   - Database credentials (`DATABASE_URL`) and storage secrets (`BLOB_READ_WRITE_TOKEN`) must never be leaked to client bundles; all database queries and token issues run in Next.js Serverless Route Handlers.

---

## 2. Technology Stack & Constraints

- **Framework & Language**: Next.js 16 (App Router), React 19, TypeScript.
- **Styling**: Strictly **Vanilla CSS** (CSS Custom Properties, Glassmorphism, CSS Modules). Do NOT introduce TailwindCSS unless explicitly instructed by the user.
- **Vision AI**: MediaPipe Selfie Segmentation (`@mediapipe/selfie_segmentation`) for background removal and blur.
- **Audio DSP**: Native Web Audio API (`AudioContext`).
- **Cloud Video Storage**: **Vercel Blob** (`@vercel/blob/client`).
- **Database**: **Neon Serverless Postgres** (`@neondatabase/serverless`).
- **Deployment**: **Vercel** (Next.js Edge CDN + Serverless Route Handlers).
- **Design Standard**: Premium, modern dark studio aesthetic (Loom / OBS Studio / Linear inspired). Avoid generic or bare-bones UI.

---

## 3. Directory Layout

```text
recordweb/
├── docs/                             # Technical specifications & architecture
│   ├── requirements.md               # User requirements
│   ├── requirements_analysis.md      # Detailed requirement breakdown
│   ├── system_architecture.md        # Legacy architecture snapshot; not a source of truth
│   ├── audio_video_pipeline.md       # AUTHORITATIVE 30fps canvas, audio DSP & segmentation specs
│   ├── ui_ux_specification.md        # Studio interface layout & design tokens
│   ├── implementation_roadmap.md     # Development phases & verification plan
│   ├── database_migrations.md         # psql migration commands and safety workflow
│   └── product_recommendations.md     # Product scope and UX recommendations
├── database/
│   └── migrations/                    # Ordered, immutable psql migration files
├── scripts/
│   └── db-migrate.mjs                 # Migration status/apply/verify runner
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Studio page ("use client")
│   │   ├── globals.css               # Design system & dark theme tokens
│   │   └── api/                      # Next.js Serverless Route Handlers
│   │       ├── upload/route.ts       # Vercel Blob client upload token generation
│   │       ├── recordings/route.ts   # Neon DB recording metadata endpoints
│   │       └── presets/route.ts      # Neon DB studio presets endpoints
│   ├── components/                   # React UI components
│   │   ├── studio/                   # StudioStage, ControlDock, FilterPanel, VuMeter
│   │   └── review/                   # ReviewModal, RecordingsDrawer
│   ├── hooks/                        # Custom React media & audio hooks
│   │   ├── useMediaDevices.ts
│   │   ├── useCanvasCompositor.ts
│   │   ├── useAudioDSP.ts
│   │   ├── useVisionSegmentation.ts
│   │   └── useRecordingSession.ts
│   ├── lib/                          # Utility libraries
│   │   ├── db.ts                     # Neon Postgres client
│   │   ├── ebmlPatcher.ts            # EBML duration patcher
│   │   └── idb.ts                    # IndexedDB local cache
│   └── types/                        # TypeScript type definitions
│       ├── media.ts
│       ├── recording.ts
│       └── database.ts
├── .agents/                          # Agentic configurations
│   ├── rules/                        # Hierarchical workspace rules
│   │   ├── code_standards.md
│   │   ├── database_management.md     # Fast DB lookup, migration, and query rules
│   │   └── memory_management.md      # Rules for updating MEMORY.md
│   └── skills/                       # Project skills for testing & verification
│       ├── media-pipeline-verifier/
│       │   └── SKILL.md
│       └── canvas-compositor-check/
│           └── SKILL.md
├── MEMORY.md                         # Persistent agent memory & state bank
├── AGENTS.md                         # Project instructions for agents
├── next.config.ts                    # Next.js configuration
├── tsconfig.json                     # TypeScript configuration
└── package.json
```

---

## 4. Verification Workflow for Agents

Before completing any implementation step:
1. Ensure TypeScript compilation passes with zero errors (`npm run build`).
2. Ensure frame rate stability at 30 FPS without frame drops.
3. Check that pausing and resuming does not freeze the canvas or corrupt the duration header.
4. Ensure microphone mute, sound filters, and VU meter function without audio glitching.
5. Verify that camera background removal cleanly feathers the edges without crashing WebGL contexts.
6. Verify proper cleanup of `MediaStream` tracks (`track.stop()`) on stream replacement or unmount.
7. Verify database serverless queries run without connection pool exhaustion using `@neondatabase/serverless`.
8. Verify cloud uploads bypass 4.5MB serverless limits via direct client-to-blob streaming.

### Database task startup

For any Neon, SQL, migration, database type, authentication ownership, recording metadata, preset, or sharing task, first read [.agents/rules/database_management.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/.agents/rules/database_management.md). Use `database/migrations/` as the schema source of truth and use `npm run db:status`, `npm run db:migrate`, and `npm run db:verify` instead of editing Neon manually.

### Repository & memory compliance

`docs/system_architecture.md` is a stale legacy snapshot. Do **not** use it as a source of truth or require implementation to conform to it. Determine current subsystem boundaries and data flow from the implemented code, types, tests, route contracts, and the relevant maintained domain document. For media-pipeline work, [docs/audio_video_pipeline.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/docs/audio_video_pipeline.md) remains authoritative. For UI-only work, use [docs/ui_rebuild_impact_analysis.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/docs/ui_rebuild_impact_analysis.md) as the maintained boundary and risk inventory, then verify every referenced path against the current repository.

Agents MUST also follow [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md) as the persistent state bank: read it on startup and update it on milestones, decisions, and bugs, per [.agents/rules/memory_management.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/.agents/rules/memory_management.md).

---

## 5. Memory Synchronization Protocol

Agents must strictly adhere to [.agents/rules/memory_management.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/.agents/rules/memory_management.md):
- **On Startup**: Read [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md) to understand active phase and immediate next steps.
- **On Milestone Completion**: Update the progress checklist and next tasks in [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md).
- **On New Decisions / Bugs**: Record architectural decisions or discovered browser quirks in [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## UI Modification Safety Rules

When the task involves UI redesign, visual improvements, or styling changes, strictly follow these rules:

### 1. Scope of Changes
- Only modify the presentation layer, including React components (`.tsx`), styles (`.css`), and layout-related files.
- Preserve existing functionality and user interactions.
- Prefer minimal, targeted changes over unnecessary refactoring.

### 2. Protected Components
Do not modify the following unless explicitly authorized:
- Recording logic and session management.
- Media capture, audio DSP, video processing, and compositing pipelines.
- Backend APIs, request/response contracts, and route handlers.
- Authentication and authorization logic.
- Database schema, migrations, and queries.
- Storage and upload mechanisms.
- Environment variables and deployment configuration.

### 3. Exceptions
If a UI change requires modifying any protected component:
1. Explain why the modification is necessary.
2. Identify the affected files.
3. Describe potential risks and side effects.
4. Request explicit approval before proceeding.

### 4. Verification
- Ensure existing functionality remains unchanged.
- Preserve component props, event handlers, and state transitions unless explicitly requested otherwise.
- Run available type checks, linting, or build validation when appropriate.
- Summarize the files changed and confirm whether any protected components were affected.

**Core Principle:** UI changes must not introduce unintended behavioral or architectural changes.

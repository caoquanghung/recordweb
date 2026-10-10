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
│   ├── system_architecture.md        # Architectural subsystems & data flow
│   ├── audio_video_pipeline.md       # 30fps canvas, audio DSP & segmentation specs
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
│   │   ├── media_audio_video.md
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

---

## 5. Memory Synchronization Protocol

Agents must strictly adhere to [.agents/rules/memory_management.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/.agents/rules/memory_management.md):
- **On Startup**: Read [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md) to understand active phase and immediate next steps.
- **On Milestone Completion**: Update the progress checklist and next tasks in [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md).
- **On New Decisions / Bugs**: Record architectural decisions or discovered browser quirks in [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md).

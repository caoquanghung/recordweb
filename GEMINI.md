# RecordWeb - Agent Behavior & Engineering Guidelines

Refer to [AGENTS.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/AGENTS.md) and [docs/system_architecture.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/docs/system_architecture.md) for full architecture specifications.

## Essential Directives:
1. **Framework & Typing Standards**:
   - Built with **Next.js 16 (App Router)**, **React 19**, and **TypeScript**.
   - Mark all browser-media components and hooks with `"use client"`.
   - Strictly type all Web Audio nodes, MediaStream tracks, and canvas rendering contexts.
2. **Audio/Video Stream Management**:
   - Always call `track.stop()` on existing MediaStream tracks before acquiring new tracks or when components unmount to prevent hardware camera/microphone locks.
   - Always check `audioContext.state === 'suspended'` and call `audioContext.resume()` on user interaction.
3. **Canvas 30 FPS Lock**:
   - Never allow unbounded `requestAnimationFrame` loops when rendering into `canvas.captureStream(30)`. Enforce frame-rate throttle intervals (`~33.33ms`).
4. **Neon Postgres & Vercel Blob**:
   - Keep all database queries inside Next.js Route Handlers (`src/app/api/*`) using `@neondatabase/serverless`. Never expose `DATABASE_URL` to browser clients.
   - For video cloud uploads, use direct client uploads (`@vercel/blob/client`) via `/api/upload` token generation. Never stream large video files through serverless request bodies.
   - Maintain offline-first capability: local recording and downloads must function even if cloud services are unreachable.
5. **Style Integrity**:
   - Use Vanilla CSS (CSS Modules & Custom Properties) with design tokens defined in [docs/ui_ux_specification.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/docs/ui_ux_specification.md).
   - Maintain dark glassmorphism aesthetic with high contrast and smooth micro-animations.
6. **Persistent Memory Management**:
   - Check [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md) at the start of each session for current phase and immediate next steps.
   - Synchronize [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md) upon milestone completion, architectural changes, or discovering browser quirks per [.agents/rules/memory_management.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/.agents/rules/memory_management.md).

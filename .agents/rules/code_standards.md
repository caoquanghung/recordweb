# Code Standards & Engineering Guidelines

## 1. JavaScript Standards
- Write modern modular ES2022+ JavaScript (`import` / `export`).
- Keep code decoupled into clear single-responsibility services:
  - `MediaStreamManager`: Device queries, stream acquisition, and hardware events.
  - `CanvasCompositor`: Frame rendering, resolution scaling, PiP layouts, and stream extraction.
  - `AudioProcessor`: Web Audio graph, DSP filters, dynamic compressor, and VU meter analyser.
  - `VisionSegmenter`: MediaPipe model lifecycle, inference loop, and segmentation masking.
  - `RecordingSessionManager`: State machine, timer accumulation, pause/resume, and chunk aggregation.
  - `StorageEngine`: EBML duration repair, blob generation, and IndexedDB caching.
- Avoid large monolithic files; organize logical modules in `src/js/` or `src/modules/`.
- Handle all async promises with clean `async`/`await` and explicit `try...catch` blocks with user-friendly error messages.

## 2. CSS & Design Standards
- Strictly use **Vanilla CSS** with CSS Custom Properties (`--var-name`).
- Strictly adhere to the dark glassmorphic design system specified in `docs/ui_ux_specification.md`.
- Never use inline styles for layout or static styling; keep styles organized in dedicated CSS files (e.g. `src/css/style.css`, `src/css/studio.css`).
- Ensure full responsiveness and accessibility (proper ARIA attributes, semantic HTML elements, high contrast text).

## 3. Resource & Memory Cleanup
- Web browsers maintain hardware locks on cameras and microphones. Whenever a stream is replaced or recording stops:
  - Loop through `stream.getTracks()` and invoke `track.stop()`.
- Disconnect Web Audio nodes (`node.disconnect()`) when tearing down or reconfiguring filters to prevent audio memory leaks.
- Close unused WebGL textures or canvas 2D contexts when switching background modes.

## 4. Architecture & Memory Conformance
- Treat [docs/system_architecture.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/docs/system_architecture.md) as the **authoritative** source for subsystem boundaries, data flow, and risk mitigations (R1–R5). All implementation MUST conform to it.
- Treat [docs/audio_video_pipeline.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/docs/audio_video_pipeline.md) as the authority for the 30 FPS canvas compositor, Web Audio DSP graph, segmentation, and WebM repair.
- Follow [MEMORY.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/MEMORY.md) as the persistent state bank: read it on startup and update it on milestones, decisions, and bugs, per [memory_management.md](file:///Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/.agents/rules/memory_management.md).

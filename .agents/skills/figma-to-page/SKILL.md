---
name: figma-to-page
description: Convert a user-provided Figma frame URL into a user-specified React/Next.js target page in the existing RecordWeb repository. Use when explicitly invoked with both the Figma source and the destination route/page. Never infer the destination or invent design data when required input or Figma access is missing.
---

# Figma to RecordWeb Page

## Invocation and input

The user must supply **both** of these inputs after invoking `$figma-to-page`:

1. **Figma source** — a node-specific Figma Design URL containing `node-id`.
2. **Target page** — the exact RecordWeb route, page file, or unambiguous existing page name to implement.

Preferred invocation:

```text
$figma-to-page <FIGMA_URL> --target /dashboard
```

Labeled natural-language input is also valid:

```text
$figma-to-page
Figma: https://www.figma.com/design/...?...node-id=...
Target: /dashboard
```

Valid target forms include:

- route: `/dashboard`, `/library`, `/settings`, or another explicit route;
- page file: `src/app/dashboard/page.tsx`;
- an existing page name only when it resolves to exactly one route.

- Parse the Figma source and target page independently. The selected Figma node defines design scope; the target defines the only page destination.
- Never infer the target from the Figma frame name/content, the active editor tab, the current browser route, or similarity to an existing screen.
- If either required input is missing, ask only for the missing input and do not inspect Figma or modify the repository yet.
- If the Figma URL lacks `node-id`, request a node-specific frame URL. Do not choose a frame from the file automatically.
- If a target name maps to multiple routes/files, ask for an exact route or page path. Do not choose one.
- If the explicit target route does not exist, create it using current App Router conventions. If it exists, update that page without replacing unrelated behavior.
- If a supplied route and page-file path conflict, stop and ask which destination is authoritative.
- Never redirect implementation to a different page because the design appears semantically better suited to it.
- Default output is **a functioning UI page in the repository**, not merely a Markdown report.

## Phase 1 — Validate Figma access

1. Use the installed Figma plugin/MCP tools to retrieve the selected frame's design context, hierarchy, relevant screenshot/render, layout properties, typography, variables, variants, and asset references as the tools permit.
2. Confirm node identity and dimensions. If the plugin cannot access the URL, stop and report the exact access issue. Do NOT approximate from the URL or fabricate design details.
3. Use Figma properties as design evidence. Mark ambiguous interactions/responsiveness as inference; only implement behavior backed by the repository or explicitly required for usable UI.
4. Avoid pulling unrelated frames, or materializing a huge node tree, unless necessary for shared components.

## Phase 2 — Inspect existing RecordWeb implementation

Resolve the explicit target to one canonical route and page file before editing. Record that mapping in the working notes and keep it fixed for the run. Then read relevant repository files, package scripts, style conventions, routing, global design tokens, existing components, hooks, and tests. Examples of candidate areas (verify existence before use):

- `AppNavigation`, `WorkspaceShell`, `StudioShell`
- `StudioHeader`, `StudioToolbar`, `StudioStage`, `StudioSourcesPanel`, `StudioEffectsPanel`, `StudioReviewWorkspace`
- `useStudioController`, media session/context providers, `useMediaDevice`, `useRecordingSession`, `useAudioDSP`, `useCanvasCompositor`
- CSS modules, `src/app` routes, shared UI components

Do not assume any named path exists. Check the repository, then choose the least invasive integration strategy within the explicitly supplied target. Repository inspection may refine implementation details but must not change the destination.

Create a concise component mapping in your working notes: Figma component → existing component (reuse, restyle, extend, compose, or create) → source files → intended changes.

## Phase 3 — Reverse engineer visual design

Analyze:

- Page frame, structural regions, component hierarchy, and repeatable primitives
- Exact Figma-measured geometry, Auto Layout, padding/gap, sizing/constraints
- Typography, color tokens, borders, shadows, radii, icons, assets
- Visible content and supported variants/states
- Responsive constraints supported by Figma; unknown breakpoints are not facts
- Media-specific elements: capture source selector, preview/stage, camera PIP, microphone/system sound/mix meters, toolbar, recording status/timer, playback/review; include only elements actually in the selected design

Do not confuse a static Figma mockup with implemented media behavior. Preserve a clear separation of design evidence, repository behavior, and implementation decisions.

Write a succinct spec to `docs/ui/<target-page-slug>-reconstruction.md` containing: source URL/node, the explicit target route/page file, hierarchy, tokens, component mapping, interaction contracts, assumptions, and key visual acceptance criteria. Derive the slug from the target, not from the Figma frame name. This is a by-product, not the final deliverable.

## Phase 4 — Implement the UI page

1. Implement the selected Figma node only in the explicit target page and the minimum necessary presentation dependencies. Follow the repository's React/Next.js conventions and existing architecture. Use reusable components, semantic markup, accessible controls, keyboard focus, and responsive layouts.
2. Reuse existing components/hooks/controllers whenever they already implement the desired interaction. Keep data and event flows consistent with existing providers.
3. Do not duplicate media capture streams or recording controllers inside presentational components.
4. Do not replace or refactor recording/capture/audio/segmentation/storage internals solely to achieve visual fidelity. If the design demands missing domain behavior, deliver the safe UI integration possible and report the missing feature instead of inventing a backend or faking a live signal.
5. Use existing asset/icon conventions. Only add assets that can be sourced through the permitted Figma export flow. Never hardcode fake meter readings, permissions, timer progress, or recording status as live data.
6. Implement loading, idle, error, permission-denied, recording, paused, and review states only where the design and existing app state support them. Do not conflate observed Figma variants with guaranteed application features.
7. Restrict modifications to the explicitly requested target page and necessary reusable styles/components. Do not redesign or replace another route, even when it appears to match the Figma design more closely.

## Phase 5 — Verify

- Run available checks appropriate to the repository (`lint`, typecheck, tests, build) when practical. Do not claim a check passed unless run.
- If browser/UI preview is available, compare the implemented page against the selected Figma frame at equivalent viewport, correct major visual mismatches, and check at least one narrower viewport.
- Check navigation and interactive controls; ensure no unhandled runtime errors.
- For an existing recording page, verify that preview, capture, pause/resume, stop, and playback are not knowingly broken by the UI changes; report if runtime media permission testing is unavailable.
- Report any missing assets or unsupported states accurately.

## Output contract

Complete the repository changes in the current run. At the end report succinctly:

1. Figma frame and implemented route/page
2. Files added/changed, including the spec path
3. Reused components and hooks
4. Verification commands/results
5. Any remaining fidelity or functionality gaps

Do not stop after analysis when implementation is possible. Do not claim screenshot-perfect fidelity without visual verification.

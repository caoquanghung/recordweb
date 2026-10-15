---
name: react-ui-implementer
description: >
  Implement RecordWeb React or Next.js UI from a completed, implementation-ready
  UI analysis and handoff. Use for the second phase of the Figma-to-code workflow
  when production UI must be built with Vanilla CSS while preserving existing
  hooks, media pipelines, APIs, authorization, persistence, and upload behavior.
---

# Implement RecordWeb UI

## Mission

Implement a frozen UI specification as maintainable React/Next.js presentation code. Match the documented visual and interaction target while preserving RecordWeb's existing behavior and protected subsystem contracts.

Definition of done:

- every in-scope requirement ID is implemented or explicitly reported as blocked;
- the UI is responsive and accessible to the extent specified;
- existing business/media behavior remains intact;
- required static assets are durable and exact;
- lint, production build, targeted functional checks, and available visual checks pass;
- protected files are unchanged unless the user explicitly approved an expanded scope.

Do not claim pixel-perfect or runtime verification without actually rendering or exercising it.

## Required inputs and readiness gate

Require either:

- `visual-spec.md` plus `implementation-handoff.md`; or
- one combined document containing the equivalent sections.

The handoff must identify scope, target routes, requirement IDs, component/data contracts, assets, acceptance criteria, protected boundaries, and `status: ready-for-implementation`.

Do not start production edits when:

- the handoff is `draft` or `blocked`;
- a major region or interaction contract is absent;
- a required asset has no durable source or exact retrieval instruction;
- implementation would require inventing product behavior;
- the requested UI-only work requires a protected hook, media, API, auth, database, storage, or extension change without explicit approval.

In those cases, produce a concise gap report tied to requirement IDs and stop. Minor visual details may use clearly documented `ASSUMPTION` values when they do not change behavior, ownership, or scope.

## Authority by domain

- User instructions control scope and explicit product decisions.
- `AGENTS.md` controls repository safety and implementation constraints.
- The ready handoff controls desired appearance, interactions, and acceptance criteria.
- Current code, types, tests, and route contracts control existing behavior and lifecycle ownership.
- `docs/audio_video_pipeline.md` controls media-pipeline invariants when the target touches Studio/media presentation.
- `docs/ui_rebuild_impact_analysis.md` defines maintained UI boundaries and redesign risks.
- `docs/system_architecture.md` is a stale legacy snapshot and must not be used as a source of truth.

When visual intent conflicts with existing behavior, preserve behavior and report the conflict unless the handoff explicitly authorizes a behavior change.

## Required preflight

Before editing:

1. Read the complete visual spec and handoff, including referenced screenshots and assets.
2. Read `AGENTS.md`, `MEMORY.md`, and `docs/ui_rebuild_impact_analysis.md`.
3. If Studio/media UI is in scope, read the relevant sections of `docs/audio_video_pipeline.md`.
4. Read the relevant Next.js 16 guides under `node_modules/next/dist/docs/` before changing routing, layouts, Server/Client Component boundaries, images, fonts, CSS, or data flow.
5. Inspect `package.json`, the exact target route, neighboring layout, shared shell/navigation, current components, CSS Modules, types, hooks, providers, assets, and tests.
6. Inspect `git status` and preserve all pre-existing user changes. Never clean or rewrite unrelated work.
7. Create a requirement-ID checklist mapping each item to the intended file and verification method.

For UI-only work, record a baseline hash or diff for all custom `use*` files and the protected owners listed below. Recheck them before completion.

## Protected boundaries

Unless the user explicitly authorizes a broader change, do not modify:

- `src/hooks/**`;
- `src/components/studio/useStudioController.ts`;
- `src/components/media/MediaSessionProvider.tsx`;
- `src/components/media/usePersistentPanelPosition.ts`;
- `src/components/review/useRecordedAudioWaveform.ts`;
- `src/lib/**` and `public/frame-ticker-worker.js`;
- `src/app/api/**`, `src/proxy.ts`, database migrations and database contracts;
- authentication/authorization checks, storage/upload mechanisms, environment or deployment configuration;
- `extension/**`.

Also preserve existing component props, refs, event handlers, state transitions, provider order, ownership and cleanup semantics unless the approved handoff explicitly changes them.

If a protected change becomes necessary:

1. explain why the UI cannot be implemented safely without it;
2. identify exact files and contracts;
3. describe risks and verification needs;
4. request explicit approval before editing those files.

Do not instantiate the same side-effectful custom hook in multiple children. Reuse the established provider/controller owner and pass state/actions through existing contracts or a presentation-only adapter.

## Figma and asset handling

The implementation-ready handoff is the frozen target. Do not reopen Figma for ordinary details already captured in it.

If a material ambiguity requires live Figma inspection:

1. pause production edits for that requirement;
2. load `figma:figma-design-to-code` before `get_design_context` and follow its screenshot/high-fidelity rules;
3. use Figma read-only;
4. update or request an updated phase-one handoff rather than silently changing the implementation target.

Reuse Code Connect mappings exactly when the handoff identifies them and the component can express the design. Use every required static asset in its specified slot and proportions. Do not substitute emoji, redraw supplied assets, inline extracted SVG paths, or retain temporary Figma asset URLs. Keep API- or data-provided imagery dynamic.

## Implementation plan

Before code changes, state a short plan containing:

- target routes and files;
- component tree and presentation responsibilities;
- state/event ownership and existing handler mapping;
- allowed files versus protected files;
- requirement IDs covered by each vertical slice;
- verification commands and browser scenarios.

Prefer reuse, restyling, composition, and small presentation adapters over duplicated state or parallel business logic. Extract a component only when repetition, semantics, lifecycle isolation, or readability justifies it.

## Styling rules

RecordWeb uses Vanilla CSS, CSS Custom Properties, and CSS Modules.

- Do not introduce TailwindCSS, CSS-in-JS, or a new design-system dependency unless the user explicitly requests it.
- Reuse existing semantic tokens where they fit; add scoped tokens when the handoff requires a distinct value.
- Avoid broad global selectors, inline static layout styles, and magic positioning that works at only one viewport.
- Preserve media aspect ratios, scroll ownership, safe areas, overlay layering, and usable recording controls.
- Support long labels and realistic empty/error content without breaking layout.
- Keep shared styles genuinely shared; do not force page-specific visuals into global CSS.

## Implement in vertical slices

For each requirement group:

1. Build semantic structure and component boundaries.
2. Apply documented tokens, geometry and assets.
3. Connect only verified state and handlers.
4. Add documented responsive behavior.
5. Implement keyboard, focus, accessible names, status announcements, disabled states, and reduced-motion behavior.
6. Exercise the slice before moving to the next one.

Every visible interactive control must either work through an existing verified contract or be explicitly blocked in the handoff. Never fake successful capture, upload, save, share, deletion, or permission behavior.

For Next.js:

- keep Server Components as the default and use Client Components only for interactivity or browser APIs;
- never access `window`, `document`, media APIs, or IndexedDB during server rendering;
- preserve Clerk/auth checks and server-side access decisions;
- use the repository's current routing, image, font and CSS conventions from the installed Next.js version.

## Verification

Always run:

```bash
npm run lint
npm run build
```

Fix failures caused by the implementation. Do not hide failures with `any`, blanket lint suppressions, or weakened types.

When browser tooling is available:

- render the exact target route at every reference viewport;
- compare screenshot hierarchy, geometry, typography, spacing, colors, borders, radii, shadows and assets;
- test all documented interaction states plus loading, empty and error states that are in scope;
- test keyboard navigation, focus visibility, accessible names and dialog/menu close behavior;
- inspect console errors and hydration warnings;
- correct the largest visual discrepancy first and iterate.

If direct visual testing is unavailable, state that fidelity remains unverified and provide precise manual checks. Never claim visual parity from lint/build alone.

Apply additional verification proportionally:

- Shared shell, Dashboard, Library or Settings presentation: route rendering, responsive navigation, permissions represented honestly, and affected empty/loading/error flows.
- Studio DOM, canvas ref, control or controller wiring: use `canvas-compositor-check` and/or `media-pipeline-verifier` for the affected boundary, then exercise start/pause/resume/stop and cleanup when runtime access permits.
- Any explicitly approved media change: run the relevant specialist skill and distinguish static, build and real-device runtime evidence.

Before completion, compare the protected-file/custom-hook baseline. For UI-only work, every protected file must be byte-identical to its starting state.

## Memory and delivery

Update `MEMORY.md` only when the work completes a milestone, establishes a durable decision, or discovers a bug, following `.agents/rules/memory_management.md`.

Report:

1. Implemented requirement IDs, routes, components, states and responsive behavior.
2. Files changed and why.
3. Protected-file result, explicitly confirming whether custom hooks changed.
4. Commands, browser comparisons and runtime scenarios actually executed.
5. Remaining gaps, assumptions and blocked IDs.

Do not say complete while an in-scope requirement remains unresolved.

## Completion checklist

- [ ] Handoff status was `ready-for-implementation`.
- [ ] Every in-scope requirement ID is implemented or explicitly blocked.
- [ ] Only allowed presentation files changed, unless broader scope was approved.
- [ ] Custom hooks and protected owners match their baseline for UI-only work.
- [ ] Vanilla CSS/CSS Modules are used; no unapproved styling dependency was added.
- [ ] Required static assets are exact, durable and correctly proportioned.
- [ ] Existing handlers, refs, state transitions, provider order and cleanup remain intact.
- [ ] Accessibility and documented responsive behavior are implemented.
- [ ] `npm run lint` and `npm run build` pass.
- [ ] Visual/browser verification was performed when available, otherwise the limitation is explicit.
- [ ] Final report maps results and gaps back to requirement IDs.

**Success condition:** the specified UI is production-ready, visually traceable to the phase-one evidence, and integrated without changing RecordWeb's protected behavior.

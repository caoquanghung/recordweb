---
name: analyze-ui-design
description: >
  Read Figma designs, screenshots, or screen recordings and produce a versioned,
  evidence-based UI specification plus an implementation handoff for RecordWeb.
  Use for the analysis phase before React implementation. This skill may inspect
  the repository but must not modify production UI or application logic.
---

# Analyse RecordWeb UI Design

## Mission and boundary

Translate a visual design into a precise, testable contract for a later React implementation pass. This is an analysis and planning skill, not an implementation skill.

Allowed outputs are Markdown specifications and optional durable reference assets under `docs/ui-reconstruction/`. Do not modify production React, CSS, hooks, APIs, persistence, media processing, extension code, or the source Figma file unless the user separately authorizes that work.

By default, create one directory per screen or coherent flow:

```text
docs/ui-reconstruction/<screen-slug>/
├── visual-spec.md
├── implementation-handoff.md
└── references/                 # Only durable reference images/assets when needed
```

If the user requests one document, combine the two deliverables without dropping their required sections. Never overwrite another screen's analysis.

## Startup and project context

When the repository is available:

1. Read `AGENTS.md`, `MEMORY.md`, and `docs/ui_rebuild_impact_analysis.md`.
2. Inspect the current target route, its shared shell/navigation, presentation components, CSS Modules, controller/provider boundaries, and relevant imports.
3. For Studio or media-dependent UI, also read the relevant sections of `docs/audio_video_pipeline.md`.
4. Do not use `docs/system_architecture.md`; it is a stale legacy snapshot.
5. Treat current code, types, tests, and route contracts as evidence of existing behavior. Verify every path and symbol before citing it.

Keep these layers distinct:

- presentation: components, layout, copy, controls, visual states;
- controller/custom hook: orchestration state and commands;
- context/provider: shared state and lifecycle ownership;
- media engine: capture, canvas, segmentation, Web Audio, encoding;
- persistence/backend: IndexedDB, Blob upload, metadata, APIs and authorization.

Never redesign or reconstruct a media engine merely to match a visual reference.

## Figma acquisition workflow

When the source is a live Figma design:

1. Use the Figma connector in read-only mode. Do not call a Figma write tool.
2. Before any `get_design_context` call, load `figma:figma-design-to-code` and follow its required `skillNames` usage.
3. Request a screenshot with the initial design-context call. If none is returned, fetch the screenshot before analysis.
4. If the context is sparse, correlate visible child node IDs with the screenshot and request the relevant child nodes in a parallel batch.
5. Record the Figma file URL/key, page, frame/component name, node ID, inspected variants, and retrieval time.
6. Inspect available Auto Layout, constraints, component properties/variants, variables, styles, prototype interactions, assets, and Code Connect mappings. Report only data actually exposed by Figma.
7. Treat code returned by Figma as inspection evidence, not production code and not an architectural recommendation.

For static screenshots or recordings, record filename/URL, pixel dimensions, visible browser/OS chrome, likely app viewport, display scaling when known, timestamp/frame, page identity, and visible state.

Do not leave temporary Figma asset URLs as deliverables. For every required asset, identify either a durable existing repository asset or an exact export/retrieval instruction for the implementation phase.

## Evidence model and authority

Label every substantive claim:

- **User requirement**: explicitly stated by the user.
- **Verified (Figma)**: read from Figma node properties, variables, variants, constraints, prototype links, or Code Connect.
- **Observed (render)**: visible in a Figma screenshot, image, or recording frame.
- **Measured**: sampled or derived from pixels; include tolerance or precision.
- **Verified (repository)**: supported by current code, type, test, route, or symbol.
- **Inferred**: plausible but not confirmed.
- **Proposed**: a deliberate recommendation for RecordWeb.
- **Unknown**: insufficient evidence.

Use domain-specific authority instead of one global priority:

- Desired appearance: user requirement → Verified Figma → rendered reference → measured estimate → inference.
- Existing behavior and capability: current repository/runtime evidence → maintained domain documentation → inference.
- Safety and scope: `AGENTS.md` → current protected contracts → proposal.

When sources conflict, record the conflict. The design defines desired appearance; the repository defines currently available behavior. Do not infer capture, permissions, persistence, routing, authorization, or audio mixing from a visual design.

## Visual analysis

For every in-scope screen:

1. Identify page purpose, route, state, and shared versus page-specific shell.
2. Build a semantic component tree.
3. Specify region relationships: position, width/height rules, min/max constraints, aspect ratios, alignment, padding, gaps, overflow, layering, sticky/fixed behavior, and scroll ownership.
4. Separate source-video ratio, preview-canvas ratio, and page-layout ratio. Document PIP size, crop, position, radius, and preview bounds when present.
5. Capture typography, semantic colors, surfaces, opacity, blur, borders, shadows, radii, control sizes, icon sizes, spacing scales, copy, units, and empty states.
6. Record responsive behavior that is observed in separate frames. Label unobserved adaptations as Proposed.
7. Record accessibility evidence and proposals: semantics, focus, accessible names, contrast, target sizes, keyboard order, announcements, reduced motion, and dialog/menu behavior.

For dynamic elements such as preview video, PIP, meters, waveforms, cursor overlays, timers, recording indicators, or timelines:

- describe exactly what is visible and what varies frame-to-frame;
- map it to a verified repository signal when one exists;
- label loading, no-signal, permission-denied, stale-source, or unsupported fallbacks as Proposed unless observed;
- never invent a waveform, independent audio track, cursor trajectory, or analyser source because another product has one.

## Repository integration analysis

Build a current architecture inventory:

| UI region/feature | Existing path and symbol | State/hook owner | Verified capability | Protected constraint | Evidence |
|---|---|---|---|---|---|

For each design element choose exactly one disposition:

- **Reuse as is**
- **Restyle**
- **Extend**
- **Compose**
- **New UI component**
- **Blocked**
- **Out of scope**

Use a traceable mapping:

| Requirement ID | Design element | Target route | Disposition | Existing evidence | Proposed UI owner | Data/handler contract | Risk |
|---|---|---|---|---|---|---|---|

Assign stable IDs such as `LAYOUT-STUDIO-01`, `COMP-NAV-01`, `INTERACTION-RECORD-01`, and `A11Y-DIALOG-01`. Reuse these IDs in acceptance criteria and in the implementation handoff.

Classify every proposed change as one of:

- presentation-only;
- UI state plumbing;
- new product behavior;
- protected media/backend change.

Any protected change is a blocker for a UI-only implementation until the user explicitly expands scope.

## Interaction contracts

For each important control, document:

| Requirement ID | Control | Visible states | User action | Expected feedback | Verified current handler/state | Unknown or dependency |
|---|---|---|---|---|---|---|

Account for permission requests, unavailable devices, unsupported system/tab audio, source readiness, countdown, recording, pause/resume, stopping/finalizing, upload, completion, and errors only where relevant. Do not assume these labels match existing enums.

Preserve established ownership. A presentational component must not create a competing `getUserMedia`, `getDisplayMedia`, Web Audio, compositor, recorder, persistence, or upload lifecycle merely to render the design.

## Deliverable metadata and readiness gate

Begin both documents with metadata equivalent to:

```yaml
spec_version: 1
status: draft | blocked | ready-for-implementation
screen: <screen or flow>
figma_file: <URL/key or not-applicable>
figma_nodes: [<node IDs>]
captured_at: <ISO timestamp>
repository_commit: <commit SHA when available>
target_routes: [<routes>]
reference_viewports: [<width x height>]
```

Use `ready-for-implementation` only when:

- scope and target routes are known;
- every major visible region is specified;
- interactions are mapped to verified contracts or explicitly bounded;
- required assets have a durable source or exact retrieval instruction;
- acceptance criteria use requirement IDs and are testable;
- no unresolved blocker would force the implementer to invent product behavior or alter protected code.

Otherwise use `draft` or `blocked` and list the exact missing decisions.

## `visual-spec.md`

Include:

1. Source and provenance registry.
2. Evidence/confidence legend.
3. Screen identity and visible workflow state.
4. Semantic component tree.
5. Region-by-region layout specification.
6. Component variants and visible states.
7. Typography, color/surface, spacing and sizing tokens.
8. Exact visible copy.
9. Asset/icon manifest with source and export requirements.
10. Dynamic media presentation.
11. Observed states versus inferred/proposed states.
12. Responsive and accessibility behavior.
13. Unknowns, contradictions and assumptions.
14. Requirement-ID-based visual acceptance checklist.

## `implementation-handoff.md`

Include:

1. Scope, out-of-scope, readiness status and blockers.
2. Verified current repository inventory.
3. Requirement-to-code disposition matrix.
4. Proposed component hierarchy and presentation/controller/provider boundaries.
5. State, data, handler and interaction contracts.
6. Asset retrieval and Code Connect reuse plan when available.
7. Safest implementation sequence.
8. Allowed presentation files and protected files/contracts.
9. Regression risks and required verification by risk level.
10. Requirement-ID-based acceptance criteria: visual, interaction, accessibility, responsive and functional preservation.
11. Open decisions and assumptions allowed during implementation.

The handoff must be sufficient for implementation without reopening Figma for ordinary details. If later Figma access reveals design drift, update this analysis instead of silently changing the implementation target.

## Quality gate

Before completing:

- [ ] Figma provenance or static-reference provenance is recorded.
- [ ] Figma-native facts, rendered observations, repository facts, measurements, inferences and proposals are not blended.
- [ ] Screenshot pixels and CSS viewport dimensions are distinguished.
- [ ] Major regions, component variants, copy, assets and interactive states are covered.
- [ ] Current paths and hook/handler names were inspected before citation.
- [ ] Every design element has a disposition and requirement ID.
- [ ] Protected media, persistence, API, auth and extension boundaries are explicit.
- [ ] Temporary Figma asset URLs are not treated as durable inputs.
- [ ] Responsive and accessibility claims are labeled observed or proposed.
- [ ] Acceptance criteria are independently testable.
- [ ] Status is honestly `draft`, `blocked`, or `ready-for-implementation`.
- [ ] No production React/CSS/application logic or speculative API was generated.

**Success condition:** another agent can implement the frozen design target with minimal ambiguity, trace every result to evidence, and preserve RecordWeb's existing behavior and protected pipelines.

---
name: react-ui-implementer
description: Implement a React or Next.js UI from an existing UI reverse-engineering specification. Use when given a UI analysis document, screenshot references, and a target React codebase, and asked to build or update the UI with production-quality components, styles, interactions, responsiveness, accessibility, and verification.
---

# React UI Implementer

## Mission

Transform a **completed UI reverse-engineering document** into maintainable, working UI in an existing React/Next.js codebase. The specification is the target for visual and behavioral fidelity; the repository is the source of truth for framework, architecture, dependencies, conventions, and existing reusable components.

**Definition of done:** The requested UI is implemented, integrated, responsive, accessible, and validated with the checks available in the repository. Do not claim pixel-perfect fidelity or successful browser verification without actually observing it.

## Inputs

Expect some or all of:
- The reverse-engineered UI document (required): page inventory, component hierarchy, visual tokens, spacing, typography, layout, interactions, responsive rules, and states.
- Screenshots and asset references (recommended).
- Target routes/pages or implementation scope.
- A React/Next.js repository and its existing design system.

If an item is absent, inspect the repository and make a documented, conservative assumption. Ask only if implementation is blocked by an essential ambiguity. Do not invent unavailable source visuals or claim unspecified behavior was observed.

## Authority and constraints

1. Follow explicit user instructions and constraints.
2. Use the reverse-engineering document as the **UI/UX specification**.
3. Follow existing repository conventions for architecture, routing, component APIs, styling, state management, testing, and dependency versions.
4. Treat any existing design system as reusable implementation infrastructure, **not** a reason to override explicit UI requirements. Flag conflicts and choose the smallest scoped override consistent with the spec.
5. Use reasonable, clearly marked assumptions only when neither the specification nor codebase resolves a detail.

**Do not:**
- Rebuild unrelated pages, change backend APIs, or refactor unrelated code.
- Add a library or large design system without a concrete need and repository-compatible justification.
- Replace real API flows with permanently hardcoded mock data; distinguish fixture/demo data from production data.
- Break existing loading/error/empty states or working interactions.
- Put all markup, styles, and business logic into one giant component.
- Silently discard specification details that are difficult to implement.
- Use `any`, blanket lint suppressions, broad CSS selectors, or placeholder buttons as shortcuts.

## Workflow

### Phase 1 — Read and normalize the specification

Read the **entire** UI document and inspect referenced screenshots/assets. Extract:

- Pages/routes and their navigation relationships.
- Layout regions and their sizing constraints.
- Reusable components, component variants, and component boundaries.
- Design tokens: color, typography, spacing, radii, borders, shadows, icons.
- All UI states: default, hover, focus, active, disabled, loading, empty, error, success, expanded, modal, menu.
- Interactions and transitions (what triggers them, expected visible result).
- Responsive breakpoints or behavior across screen sizes.
- Data dependencies and ownership (props, context, hooks, server data).

Create a working **UI implementation checklist** that maps each specification requirement to the files/components to implement. Mark unspecified details as `ASSUMPTION`, not as facts from the source.

### Phase 2 — Inspect the existing codebase

Before writing code:

1. Identify React vs Next.js, router type, TypeScript/JavaScript, existing package versions and scripts.
2. Inspect the exact target route plus neighboring layout, shared components, design tokens, global CSS, icons, assets, hooks, and data providers.
3. Check existing API/contracts, state flows, and responsive utilities.
4. Identify reusable pieces; prefer adaptation/reuse over duplication.
5. Note architectural boundaries: server/client components, data-fetching, media/session contexts, and persistent state.

**Do not call the same custom hook independently in multiple child components if it creates a new instance of shared state or side effects.** Reuse the existing provider/context or lift shared state to the appropriate owner. Pure hooks that safely calculate local state may be used independently.

### Phase 3 — Plan the minimal implementation

Plan briefly before editing, including:

- The routes and files that will change.
- A component tree and responsibilities of each component.
- Data and event flow: which component owns state; which components receive props.
- Shared tokens and styling strategy that fit the repo (CSS Modules, Tailwind, etc.).
- Order of work and verification steps.

Favor composition and clear separation of responsibilities, but **do not over-abstract**: extract a reusable component when the UI repeats, semantics warrant it, or an isolated component meaningfully improves clarity. Avoid one-component-per-HTML-element abstractions.

### Phase 4 — Implement in vertical slices

For each page or region:

1. Build semantic structure and layout.
2. Apply design tokens and exact documented visual properties.
3. Wire interactions and state changes.
4. Handle data sources and lifecycle correctly.
5. Implement responsive behavior and accessibility.
6. Run relevant checks before moving to the next slice.

**Visual fidelity requirements**
- Match hierarchy, alignment, widths, spacing, colors, text styles, borders, radii, shadows, and asset proportions.
- Use repository assets where available. Do not substitute emoji for required icons or arbitrarily replace specified imagery.
- Avoid magic-positioning or fixed dimensions that only look correct at one viewport, unless the UI specification explicitly requires them.
- Support long labels, empty data, and realistic content without broken layouts.

**Interaction requirements**
- Every visible interactive control needs meaningful behavior or a clearly disclosed implementation boundary.
- Use controlled components and predictable state ownership where appropriate.
- Cover navigation, menus, dialogs, inputs, tabs, filters, selection, tooltips, and keyboard/focus behavior when specified.
- Preserve current business logic and API contracts. If a backend feature is absent, implement an honest UI state rather than faking a successful action.
- Clean up subscriptions, timers, media tracks, and event listeners created by the new UI.

**React/Next.js requirements**
- Keep components pure where possible; isolate effects.
- Avoid unnecessary effects, duplicated derived state, unstable keys, and needless rerenders.
- Use client components only where interactivity or browser APIs require them in a Next.js App Router project.
- Never access `window`, `document`, or browser media APIs during server rendering.
- Reuse existing hooks, providers, and repositories instead of creating competing stores.
- Follow the existing codebase's naming and import conventions.

**Accessibility minimum**
- Use semantic buttons, links, headings, labels, and form controls.
- Ensure keyboard access, visible focus, accessible control names, and appropriate disabled states.
- Use ARIA only when native semantics are insufficient; dialogs/menus require suitable focus and close behavior.
- Honor `prefers-reduced-motion` for nonessential animation.

### Phase 5 — Verify and iterate

Run the relevant checks available in the project (for example: typecheck, lint, tests, production build). Fix failures caused by your changes. Do not imply any check was run unless it was actually executed.

If browser/preview/screenshot capability exists:
- Open the implemented route at the source reference viewport(s).
- Compare against source screenshots/document; inspect layout, typography, spacing, colors, assets, and each interaction.
- Test at least narrow mobile, tablet, and desktop widths when relevant.
- Correct the largest visible discrepancies first, then smaller details.
- Check browser console errors and basic keyboard use.

If visual testing cannot run, explicitly state that fidelity remains unverified by direct rendering and provide manual verification steps.

### Phase 6 — Final delivery and handoff

Report succinctly:

1. **Implemented:** routes, components, states, responsive behavior, and interactions.
2. **Files changed:** notable paths with purpose.
3. **Verification:** commands/tests actually run and their results; browser comparison results if performed.
4. **Gaps / assumptions:** specification items not implemented, missing assets/backend, and remaining discrepancies.

Do not say “complete” while known in-scope requirements remain unfinished. Favor working code over generating more planning documents.

## Completion checklist

- [ ] Every in-scope page and layout region from the spec is mapped and implemented.
- [ ] UI appearance follows documented tokens and screenshot references.
- [ ] All specified states and interactions are present.
- [ ] Mobile/tablet/desktop behavior is addressed where relevant.
- [ ] Components reuse existing architecture without duplicate sources of truth.
- [ ] Keyboard access, labels, focus, and semantic elements are handled.
- [ ] Loading, empty, and error states are handled where applicable.
- [ ] No new TypeScript/lint/build errors caused by the implementation.
- [ ] Visual/browser verification is performed if tools allow, otherwise limitations are disclosed.
- [ ] Final report lists changes, actual checks, and residual gaps.

## Invocation example

> Use the `react-ui-implementer` skill. Read `docs/ui-reverse-engineering/dashboard.md` and implement the documented dashboard UI in the current React/Next.js project at `/dashboard`. Reuse existing components, hooks, providers, and styling conventions. Match the referenced screenshots and implement all documented states and interactions. Make code changes, run available checks, and report any assumptions or unverified visual differences.

---
spec_version: 1
status: ready-for-implementation
screen: Recorded lecture library
figma_file: https://www.figma.com/design/sl2QfWk1DTKZs7SN0wqT7R/Record-UI?node-id=30-330
figma_nodes: ["30:330"]
captured_at: 2026-10-20T00:00:00+07:00
repository_commit: 2f3f04c304f79435988578e7e540f47b8a816d3f
target_routes: ["/library"]
reference_viewports: ["1280 x 1059"]
---

# Scope and readiness

Implement the `/library` presentation from the frozen visual spec. Reuse `AppSidebar`. Restyle and reorganize `LibraryClient` while preserving its existing recording data sources, event handlers, API calls, dialogs, and protected subsystem ownership.

Out of scope: new backend filters, subject taxonomy, storage quota API, upload behavior, database/API changes, media-capture changes, waveform changes, or sidebar duplication. There are no blockers; the 50 GB quota is a presentation-level institutional allowance computed from existing cloud metadata and must not imply an enforcement contract.

# Repository inventory

| UI region | Existing symbol/path | Owner | Disposition | Constraint |
|---|---|---|---|---|
| Shared sidebar | `AppSidebar` | `src/components/app/AppSidebar.tsx` | Reuse as is | Do not duplicate or restyle globally |
| Library route | `LibraryPage` | `src/app/library/page.tsx` | Reuse as is | Server page remains simple |
| Library screen | `LibraryClient` | `src/components/library/LibraryClient.tsx` | Restyle/compose | Preserve fetches and handlers |
| Library styles | `LibraryClient.module.css` | presentation | Replace scoped styles | Vanilla CSS Module only |
| Local persistence | `getAllLocalRecordings`, `deleteLocalRecording` | `src/lib/idb.ts` | Reuse as is | Protected, byte-identical |
| Cloud/share contracts | `/api/recordings`, `/api/shares` | route handlers | Reuse as is | Protected, byte-identical |
| Waveform/cursor | review components | review layer | Reuse as is | Preserve props and ownership |

# Requirement-to-code matrix

| Requirement | Target | Disposition | Contract / verification | Risk |
|---|---|---|---|---|
| `LAYOUT-LIBRARY-01` | `LibraryClient.tsx`, CSS | Compose `AppSidebar` + main | `/library` active; 288px desktop shell | Low |
| `LAYOUT-LIBRARY-02`–`06` | CSS and semantic JSX | Restyle | screenshot hierarchy, 3-column grid/footer | Medium |
| `COLOR-LIBRARY-01`–`02` | CSS custom properties | New scoped tokens | contrast/manual render | Low |
| `TYPE-LIBRARY-01` | CSS | Restyle | Be Vietnam Pro fallback chain | Low |
| `SURFACE-LIBRARY-01` | CSS | Restyle | borders/radii/shadows | Low |
| `ASSET-LIBRARY-01` | JSX | Reuse `AppSidebar` | no duplicate sidebar | Low |
| `ASSET-LIBRARY-02` | recording card | Extend presentation | existing preview URLs only | Medium |
| `ASSET-LIBRARY-03` | local icon component | New UI component | decorative SVG hidden | Low |
| `RESP-LIBRARY-01` | CSS media queries | New presentation rules | 1180/840/680 widths | Medium |
| `A11Y-LIBRARY-01`–`02` | JSX/CSS | Extend | labels, focus, status, reduced motion | Low |

# Component and state boundaries

`LibraryClient` remains the sole client owner. Existing loading, records, messages, previews, sharing, permissions, and mutations remain unchanged. Presentation-only state may be added for search, sorting, and pagination. These states filter already-loaded arrays and must never trigger new media, API, storage, or persistence lifecycles.

The recommended internal presentation structure is `LibraryIcon`, `MediaThumbnail`, `LibrarySummary`, `LibraryToolbar`, `RecordingCard`, and `LibraryPagination`. Extraction is optional; preserve readable handler access and avoid moving business logic.

# Handler contracts

- Sync button → existing `loadLibrary`.
- Search/sort/pagination → local UI state only.
- Local preview/download/cursor/delete → existing handlers.
- Cloud open/share/download/cursor/privacy/delete → existing handlers and links.
- Shared open/download/cursor → existing permission checks.
- Existing dialogs remain mounted from the same state and handlers.

# Allowed and protected files

Allowed: `src/components/library/LibraryClient.tsx`, `src/components/library/LibraryClient.module.css`, analysis docs, and milestone-only `MEMORY.md`.

Protected and expected byte-identical: `src/hooks/**`, `src/components/studio/useStudioController.ts`, media providers, review hooks, `src/lib/**`, `src/app/api/**`, `src/proxy.ts`, migrations, auth, storage/upload, environment/deployment files, and `extension/**`. `AppSidebar` should be reused without modification.

# Implementation sequence

1. Record protected-file baseline and confirm a clean worktree.
2. Replace `WorkspaceShell` usage with a scoped library shell composed with `AppSidebar`.
3. Add summary/quota and toolbar, mapped to current loaded data and `loadLibrary`.
4. Recompose current local/cloud/shared cards into the reference hierarchy without dropping actions.
5. Add presentation-only search, newest/oldest sorting, and six-card pagination.
6. Restyle dialogs and all loading/empty/error states in the same light theme.
7. Verify responsive layout, lint, production build, diff check, and protected hashes.

# Regression risks and verification

- Highest risk is accidentally dropping a recording action while simplifying cards. Verify each local/cloud/shared capability against the original JSX.
- Media thumbnail elements must not autoplay or create a second playback lifecycle; use `preload="metadata"`, muted, and `playsInline`.
- Search/sort/pagination must operate on loaded records only and reset safely when filters change.
- Always run `npm run lint`, `npm run build`, and `git diff --check`.
- If browser rendering is unavailable, report visual fidelity as unverified and give the exact `/library` viewport check.

# Acceptance criteria

- `LAYOUT-LIBRARY-01`–`06`: `/library` renders the shared sidebar and the reference main-region hierarchy at 1280px.
- `COLOR-LIBRARY-01`–`02`, `TYPE-LIBRARY-01`, `SURFACE-LIBRARY-01`: scoped CSS implements the coherent light education palette.
- `ASSET-LIBRARY-01`–`03`: sidebar is reused; media is durable/data-driven; no temporary Figma asset is used.
- `RESP-LIBRARY-01`: three/two/one-column behavior and mobile sidebar coexist correctly.
- `A11Y-LIBRARY-01`–`02`: controls are labeled, focus-visible, keyboard reachable, and motion-safe.
- Functional preservation: every original load, preview, download, cursor, share, privacy, revoke/grant, delete, and close handler remains wired.

# Allowed assumptions

- The 50 GB quota is display-only and may show a minimum visible progress sliver while exposing the true computed amount in text.
- Current data categories replace unsupported subject filters.
- Card descriptions may be derived from verified metadata/status rather than invented lecture summaries.
- Pagination is client-side with six cards per page because the existing API returns the loaded collection without a page contract.

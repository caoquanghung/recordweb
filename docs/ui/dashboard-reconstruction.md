# Dashboard — Figma reconstruction

## Source and target

- Figma file: `Record-UI`
- Source node: `9:534` (`Dashboard`); implementation frame: `13:1718` (`Html → Body`), 1280 × 1028 px
- Source URL: <https://www.figma.com/design/sl2QfWk1DTKZs7SN0wqT7R/Record-UI?node-id=9-534>
- Target route: `/dashboard`
- Target page: `src/app/dashboard/page.tsx` through `src/components/dashboard/DashboardClient.tsx`

## Hierarchy and tokens

The selected dashboard content is a light, teacher-focused workspace with three primary regions:

1. Conditional recovery alert for interrupted recordings.
2. Blue-tinted welcome hero with the primary recording action.
3. Recent lecture cards with draft, loading, and ready treatments.

The content canvas is capped at 1280 px with 24 px side padding and 32 px vertical gaps. Primary blue is `#1d4ed8`/`#2563eb`; page background is `#f8fafc`; text uses slate values from `#0f172a` to `#64748b`; borders use `#e2e8f0`. The reference typography is Be Vietnam Pro with the repository's Geist font as the deterministic fallback.

## Component mapping

| Figma region | Existing/implemented component | Decision |
| --- | --- | --- |
| Left aside | `AppSidebar` | Reused unchanged in adaptive mode; no duplicate sidebar markup or assets |
| Dashboard canvas | `DashboardClient` | Restyled and recomposed for the selected frame |
| Recovery alert | Existing IndexedDB draft state | Rendered only when real drafts exist |
| Primary CTA | Existing `recordweb-quick-start` handoff | Preserved and routed to Studio |
| Recent cards | Existing Neon recording data and IndexedDB drafts | Static mock states replaced by real supported states |
| Workspace metrics | Existing cloud/local/preset calculations | Preserved below the Figma-defined primary viewport |
| Quick starts and presets | Existing localStorage/API actions | Preserved below the primary dashboard regions |

## Interaction contracts

- The hero action writes the same quick-start configuration and navigates to `/`.
- Recovery actions navigate to Studio, which owns draft repair and deletion.
- Saved recordings open their existing `/share/[recordingId]` route; the Library link remains `/library`.
- Preset use/delete keeps the existing localStorage key, API request, confirmation, and state update.
- The sidebar continues to own its Clerk identity/sign-out behavior and responsive drawer state.

## Assumptions

- The Figma “saving to computer” card is a visual transient state without a dashboard data contract. The implementation uses that treatment only during real dashboard loading and does not invent a persistent processing state.
- Recent card imagery is the exact Figma export and acts as a visual poster; recording titles, dates, durations, IDs, and availability remain dynamic.
- The sidebar was already implemented from Figma node `25:2615`, so this task integrates it rather than reconstructing it.

## Visual acceptance criteria

- At desktop width, the existing 288 px sidebar and 1280 px dashboard canvas form a stable two-column layout.
- Recovery, hero, section header, and lecture-card geometry match the selected Figma frame at equivalent width.
- All visible Figma image/SVG assets are stored under `public/figma/dashboard/` with no temporary Figma URLs in runtime code.
- Below 840 px the sidebar becomes its existing drawer; dashboard cards and actions collapse without horizontal overflow.
- Loading, empty, draft, and saved-recording states reflect real application state.

---
spec_version: 1
status: ready-for-implementation
screen: Recording details
figma_file: https://www.figma.com/design/sl2QfWk1DTKZs7SN0wqT7R/Record-UI?node-id=54-2
figma_nodes: ["54:2", "32:807", "32:861", "32:1121", "32:1221"]
captured_at: 2026-10-20T00:00:00+07:00
repository_commit: b52e4074bb7c64033bf3dc5d2884f0a9aa50aa7e
target_routes: ["/library/[recordingId]"]
reference_viewports: ["992 x 1188 main region plus 288px shared sidebar"]
---

# Scope and readiness

Add an authenticated recording-details destination at `/library/[recordingId]`, reached from cloud and shared Library cards. Compose `AppSidebar`, use the existing recordings API, and leave `/share/[recordingId]` as the public/recipient authorization boundary. Status is ready; no protected media/backend/auth modification is required.

Out of scope: database/query/schema changes, a new chapter persistence model, QR generation, custom media-engine controls, fake waveform/chapter data, editing recording titles, or changing public share authorization.

# Repository inventory

| Region/capability | Existing evidence | Disposition | Constraint |
|---|---|---|---|
| App shell | `AppSidebar` | Reuse as is | no duplicate sidebar |
| Owned/shared data | `GET /api/recordings` | Reuse as is | authenticated/user-scoped |
| Public state | `PATCH /api/recordings` | Reuse as is | owner-only server guard |
| Player | cloud `storage_url` | Compose native video | no fake/static media |
| Audio | `RecordedAudioWaveforms` | Reuse | preserve props/hook owner |
| Archive | `downloadRecordingArchive` | Reuse | client-to-Blob fetch/ZIP only |
| Public view | `/share/[recordingId]` | Link/reuse | do not change authorization page |
| Library cards | `LibraryClient` | Change destination links | keep local modal flow |

# Requirement mapping

| Requirement | Target files | Disposition | Verification |
|---|---|---|---|
| `DETAIL-LAYOUT-01`–`06` | new page/client/CSS | New presentation composition | render hierarchy and breakpoints |
| `DETAIL-COLOR-01`, `DETAIL-TYPE-01`, `DETAIL-SURFACE-01` | details CSS Module | Scoped tokens | visual comparison |
| `DETAIL-DATA-01`–`05` | details client | UI state plumbing | owned/shared/missing-data cases |
| `DETAIL-ASSET-01`–`03` | `public/figma/recording-details`, JSX | Reuse/download | local files and callsites |
| `DETAIL-ACTION-01`–`05` | details client | Reuse existing contracts | link/download/share/player/chapter checks |
| `DETAIL-RESP-01`, `DETAIL-A11Y-01`–`02` | CSS/JSX | New presentation behavior | keyboard and viewport checks |

# Proposed files and boundaries

- Add `src/app/library/[recordingId]/page.tsx` as a minimal dynamic route wrapper.
- Add `src/components/library/RecordingDetailsClient.tsx` for authenticated fetch, display-only derived state, player refs, copy/share UI, and existing helper calls.
- Add `src/components/library/RecordingDetailsClient.module.css` for all page-specific presentation.
- Modify only cloud/shared detail destinations in `LibraryClient.tsx`; local-only recordings keep the current object-URL preview because they are not server-addressable by cloud ID.
- Add exact inspected SVGs below `public/figma/recording-details/`.

Protected and byte-identical: `src/hooks/**`, `src/lib/**`, `src/app/api/**`, `/share/[recordingId]` authorization/query code, `src/proxy.ts`, media providers, review hooks, database/migrations, upload/storage, environment/deployment, and `extension/**`.

# State and handlers

`RecordingDetailsClient` may own loading/error, resolved owned/shared recording, share-busy/copy status, player ref, and secondary-source expanded state. It must not own media capture, audio contexts, cursor animation engines, or persistence lifecycles.

The page fetches `/api/recordings` once per recording ID and selects either `recordings` or `sharedRecordings`. `canDownload` is true for owner or `viewer_download`. Owner-only share activation uses the current PATCH body `{ id, is_public: true }`, then copies `${location.origin}/share/${id}`. Any failure is announced and no success is faked.

# Exact assets

Download icons from the inspected Figma asset prefixes and store with semantic names. Required slots include back, edit/status/calendar/duration/size, download/share, aspect/player/audio/source/cursor, sharing/copy/chapters/storage, header-back, and account. Recording/video and webcam bitmaps stay dynamic and are not downloaded into production.

# Safe implementation sequence

1. Record clean status and protected baseline hash.
2. Download exact SVG icon assets only; verify non-empty files.
3. Add the dynamic route wrapper and details client shell/loading/error states.
4. Add summary/player/waveform/sources/rail slices with real data mapping.
5. Route cloud/shared Library detail links; preserve local preview behavior.
6. Apply responsive/accessibility styling.
7. Run lint, build, diff check, protected audit, asset callsite/size audit, and available route rendering.

# Risks and verification

- Permission regression: never infer owner rights from UI; use which API collection contained the record and `share_permission` for shared records.
- Asset regression: no temporary Figma URLs; every referenced local SVG must be non-empty.
- Data honesty: no demo chapters, student class, waveform, or cursor state when metadata/assets are absent.
- Playback: native video must retain `controls`, `playsInline`, `preload="metadata"`, and `nodownload` for view-only shared users.
- Next.js 16: dynamic `params` are asynchronous; use the installed guide pattern and a route loading boundary or explicit blocking opt-out as needed.

# Acceptance criteria

All `DETAIL-*` requirements in the visual spec are implemented or reported blocked; Library cloud/shared card navigation reaches the details page; local preview is unchanged; `/share/[recordingId]` is unchanged; lint/build pass; exact assets are local; protected files match baseline; direct authenticated visual QA is reported accurately.

# Allowed assumptions

- `settings.chapters` is optional and may be absent.
- A cloud recording can have no primary `storage_url`; show a missing-video state.
- QR is not implemented because no current QR contract/dependency exists; the share URL remains copyable and accessible.
- Native video controls are preferred over inventing a parallel custom playback state machine.

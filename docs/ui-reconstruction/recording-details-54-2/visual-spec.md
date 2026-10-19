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

# Provenance and evidence

- **User requirement:** implement the video details screen reached after clicking a Library recording.
- **Verified (Figma):** node `54:2` is a 992×1187.75px detail region positioned at x=288, leaving the existing 288px application sidebar column. The detail header is 64px high and the content canvas uses 32px gutters.
- **Verified (Figma):** the main workspace is a 12-column grid: 612px left media column, 20px gap, and 296px right information rail.
- **Observed (render):** light cool-gray canvas, white 12px-radius cards, deep blue primary actions, teal success states, and pale periwinkle metadata surfaces.
- **Verified (repository):** `/api/recordings` already returns authenticated owned recordings and explicitly shared recordings with assets and permissions. `/share/[recordingId]` performs separate request-time authorization and must remain unchanged.
- **Verified (repository):** `AppSidebar` is the established 288px adaptive application navigation and must be reused unchanged.
- **Verified (Figma assets):** two bitmap images belong to the illustrative mock recording. Production video imagery remains API-supplied and dynamic; the image assets must not replace actual recording media. Exact Figma SVG icons are available through the inspected child-node asset paths and must be stored locally before use.

# Screen identity and visible state

The reference depicts a completed, cloud-synchronized owner recording with a composite video, processed microphone waveform, system-audio/cursor source summary, a ready share link, three chapters, and storage metadata. The implementation must also cover loading, inaccessible/not-found, missing-video, shared-viewer, no-chapters, no-waveform, and limited-download states from real data.

# Semantic tree

```text
RecordingDetailsPage
└─ RecordingDetailsClient
   ├─ AppSidebar
   └─ DetailMain
      ├─ DetailHeader (back link, readiness, user affordance)
      └─ DetailCanvas
         ├─ RecordingSummary (breadcrumb, title, status, metadata, actions)
         └─ DetailGrid
            ├─ MediaColumn
            │  ├─ CompositePlayerCard
            │  ├─ MicrophoneWaveformCard
            │  └─ SecondarySourcesCard
            └─ InformationRail
               ├─ ShareCard
               ├─ ChaptersCard
               └─ StorageMetadataCard
```

# Layout requirements

- **DETAIL-LAYOUT-01:** use `AppSidebar` in a 288px + fluid shell; at ≤840px preserve its existing drawer behavior and remove the fixed column.
- **DETAIL-LAYOUT-02:** 64px sticky/translucent top header, then 32px content gutters and 20px vertical rhythm. At desktop the canvas fits a 992px main region.
- **DETAIL-LAYOUT-03:** summary card is 170px in the reference, horizontally pairing title/meta with two 46px actions; allow wrapping for real long titles and narrow screens.
- **DETAIL-LAYOUT-04:** media/information columns are approximately 2:1. Collapse to one column under 1020px main width; information cards flow after media.
- **DETAIL-LAYOUT-05:** composite player preserves 16:9 and uses the recording `storage_url`. No static Figma screenshot may be used as a fake recording.
- **DETAIL-LAYOUT-06:** cards use white surfaces, 12px radius, 1px low-contrast border or subtle shadow, with internal 12–20px padding.

# Visual tokens

- **DETAIL-COLOR-01:** canvas `#f8f9ff`; ink `#0d1c2e`; secondary `#444653`; deep primary `#00288e`; primary soft `#e6eeff`/`#eff4ff`; success `#006a61`; success soft `rgba(137,245,231,.5)`; error `#ba1a1a`.
- **DETAIL-TYPE-01:** `"Be Vietnam Pro", var(--font-geist-sans), sans-serif`; title 24px/600; section titles 16–18px/600; body 13–15px; metadata 11–13px.
- **DETAIL-SURFACE-01:** 12px radii, 1px `#e6eeff` separators, 0 1px 2px subtle shadows, 44–46px primary targets.

# Content and data mapping

- **DETAIL-DATA-01:** title, created time, duration, bytes, resolution, FPS, MIME/container, storage URL, public state, settings, assets, owner label, and share permission come only from the authenticated recordings response.
- **DETAIL-DATA-02:** owner actions: direct video/archive download where assets exist; public-link activation/copy through the existing `PATCH /api/recordings`; link to the authorized share page. Shared viewers never receive owner mutations.
- **DETAIL-DATA-03:** microphone/mixed/system waveforms reuse `RecordedAudioWaveforms` and existing asset metadata/decode behavior. Missing audio shows a compact honest unavailable state.
- **DETAIL-DATA-04:** system-audio and cursor source cards reflect asset presence only. Cursor visualization may link back to the existing Library interaction; no independent cursor lifecycle is created.
- **DETAIL-DATA-05:** chapters are parsed only from a valid `settings.chapters` array with numeric seconds and non-empty labels. Otherwise render `Chưa có mốc bài giảng`.

# Assets

- **DETAIL-ASSET-01:** reuse all `AppSidebar` assets and markup through the component.
- **DETAIL-ASSET-02:** store the inspected Figma SVG icons locally under `public/figma/recording-details/`; reference them by durable paths at their native dimensions. Do not use temporary MCP URLs.
- **DETAIL-ASSET-03:** keep recording media dynamic. The two Figma bitmap reference images are not production assets because the visible content is supplied by the recording and webcam streams.

# Interaction contracts

| ID | Control | Verified action | States |
|---|---|---|---|
| `DETAIL-ACTION-01` | Back/breadcrumb | `Link` to `/library` | always available |
| `DETAIL-ACTION-02` | Download | existing archive helper or direct video URL | hidden when permission/assets disallow |
| `DETAIL-ACTION-03` | Share/copy | owner-only existing recordings PATCH + clipboard/share API | private, public, busy, error, copied |
| `DETAIL-ACTION-04` | Video player | native video controls | playable, loading, missing URL |
| `DETAIL-ACTION-05` | Chapter | set video current time if media is ready | present only for valid metadata |

# Responsive and accessibility

- **DETAIL-RESP-01 (Proposed):** ≤1180px reduce gutters; ≤1020px stack workspace columns; ≤840px activate sidebar drawer and add header menu clearance; ≤680px stack summary actions and source cards.
- **DETAIL-A11Y-01 (Proposed):** semantic header/main/section/article structure, visible focus rings, labeled video and buttons, `aria-live` status for copy/share errors, accessible empty/loading/error states, and no color-only meaning.
- **DETAIL-A11Y-02 (Proposed):** chapter buttons expose timestamp and label; disabled/hidden actions honestly reflect permissions; reduced motion removes hover transitions.

# Acceptance checklist

- [ ] `DETAIL-LAYOUT-01`–`06` implement the sidebar, 64px header, summary, 2:1 workspace, responsive stacking, and 16:9 media.
- [ ] `DETAIL-COLOR-01`, `DETAIL-TYPE-01`, `DETAIL-SURFACE-01` match the frozen visual system in scoped Vanilla CSS.
- [ ] `DETAIL-DATA-01`–`05` render authenticated real data and honest unavailable states without invented product behavior.
- [ ] `DETAIL-ASSET-01`–`03` reuse sidebar, localize exact icons, and keep media dynamic.
- [ ] `DETAIL-ACTION-01`–`05` preserve authorization and connect only verified interactions.
- [ ] `DETAIL-RESP-01`, `DETAIL-A11Y-01`–`02` are testable at desktop/tablet/mobile and by keyboard.


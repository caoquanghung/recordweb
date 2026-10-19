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

# Source and evidence

- **User requirement:** analyse and implement node `30:330`, do not use the Figma-to-code skill, and reuse the implemented left sidebar.
- **Verified (Figma metadata):** the root frame is 1280×1059. It contains a 288px `Aside` and a 992px `Main`.
- **Observed (render):** light, education-oriented recording library in Vietnamese with blue as the primary action color, slate text, white cards, pale blue accents, and green success/sync indicators.
- **Verified (repository):** `/library` renders `LibraryClient`; it already loads local, cloud, and shared recordings and owns preview, download, share, privacy, cursor, and delete actions.
- **Verified (repository):** `AppSidebar` is the established 288px adaptive shell and already marks `/library` active.
- **Constraint:** Figma was inspected only through read-only metadata and screenshot evidence. No design-context or generated-code workflow was used.

## Evidence legend

`Verified` is explicit metadata or repository evidence. `Observed` is visible in the reference render. `Measured` is derived from the 1280px frame with ±2px tolerance. `Proposed` covers responsive and accessibility behavior not shown in the single desktop frame.

# Screen identity and state

The screen is the teacher's recorded-lecture library. The reference shows a populated desktop state with six recording cards, the library navigation item active, a healthy storage/sync state, filters, newest-first sort, and page 1 selected.

# Semantic component tree

```text
LibraryPage
└─ LibraryClient
   ├─ AppSidebar (reuse)
   └─ LibraryMain
      ├─ LibrarySummary
      │  ├─ title/copy/status chips
      │  └─ StorageSyncCard
      ├─ LibraryToolbar
      │  ├─ SearchField
      │  ├─ FilterTabs
      │  └─ SortSelect
      ├─ StatusMessage | LoadingState | EmptyState
      ├─ RecordingGrid
      │  └─ RecordingCard × n
      ├─ LibraryFooter / Pagination
      └─ Existing preview, cursor, and sharing dialogs
```

# Layout and regions

- **LAYOUT-LIBRARY-01:** two-column application shell. Sidebar is exactly 288px at desktop; main is `minmax(0, 1fr)` with a cool off-white `#f8fafc` background. The sidebar remains sticky/adaptive through `AppSidebar`.
- **LAYOUT-LIBRARY-02:** main content uses 20px desktop gutters in the reference. Summary and toolbar are full-width white cards with 12–14px radius, 1px slate-blue border, and subtle shadow.
- **LAYOUT-LIBRARY-03:** summary is approximately 144px high. Copy occupies the left half; the right storage card is approximately 422×101px and contains quota text, progress, helper copy, and a blue sync button.
- **LAYOUT-LIBRARY-04:** toolbar is approximately 102px high. Search is at left, filters wrap through the center, and sort is aligned right. Controls are 36–58px high with 10–12px radii.
- **LAYOUT-LIBRARY-05:** recording cards use three equal columns with 14px gaps. Reference card width is 308px and height is approximately 317px; media is 16:7.5-ish at 144px high and content/actions fill the remainder.
- **LAYOUT-LIBRARY-06:** the bottom status/pagination bar is separated by a top border and remains readable below the grid; it is not a fixed overlay.

# Visual tokens

- **COLOR-LIBRARY-01:** primary `#1d4ed8`/`#2563eb`; primary soft `#eff6ff`; slate ink `#0f172a`; secondary `#475569`; muted `#64748b`; border `#dbe4f0`; canvas `#f7f9fc`; success `#059669`; danger `#dc2626`.
- **COLOR-LIBRARY-02:** avoid copying every Figma swatch literally. Use a coherent accessible blue/slate/emerald palette shared with the implemented sidebar and dashboard.
- **TYPE-LIBRARY-01:** use `"Be Vietnam Pro", var(--font-geist-sans), sans-serif`. Page title 27–30px/700–800; card title 16px/700; body 13–15px; labels 11–13px/600–700.
- **SURFACE-LIBRARY-01:** white panels, 1px cool-slate borders, 0 1px 2px low-opacity shadow. Cards use 14px radius and visible focus rings.

# Copy and visible states

- Header: `KHO LƯU TRỮ BÀI GIẢNG`, dynamic count chip, `Thư viện bài giảng đã ghi`, and Vietnamese management description.
- Quota: `Dung lượng học viện cấp`, dynamic used amount out of 50 GB, percentage, sync helper copy, and `Đồng bộ ngay`.
- Filters adapt existing verified data groups: `Tất cả bài giảng`, `Được chia sẻ`, `Chỉ trên máy`, and `Đã lưu đám mây`.
- Card actions retain existing semantics, localized as `Xem lại`, `Chia sẻ`, `Tải về`, privacy, cursor, and delete actions where capability exists.
- Loading, empty, API message, preview dialog, cursor dialog, and share dialog remain represented honestly.

# Assets and dynamic media

- **ASSET-LIBRARY-01:** reuse existing sidebar assets via `AppSidebar`; do not duplicate the sidebar markup or icons.
- **ASSET-LIBRARY-02:** recording imagery is data-driven. Use the existing local object URL or cloud `storage_url` as a muted, non-autoplay media thumbnail when available. Use a code-native gradient fallback when unavailable; do not ship temporary Figma URLs or demo thumbnails as recording data.
- **ASSET-LIBRARY-03:** small interface icons may be accessible, code-native SVG components because no durable exact Figma exports were supplied by the analysis path.

# Responsive and accessibility

- **RESP-LIBRARY-01 (Proposed):** at ≤1180px use two card columns; at ≤840px let `AppSidebar` become its existing drawer and add top padding for its menu button; at ≤680px use one card column and stack summary/toolbar/footer controls.
- **A11Y-LIBRARY-01 (Proposed):** semantic main/header/section/article structure, labeled search and sort, current tab via `aria-selected`, status via `role=status`, visible focus rings, and minimum 40px primary targets.
- **A11Y-LIBRARY-02 (Proposed):** media thumbnails remain buttons with recording-specific accessible names; decorative icons are hidden; reduced-motion removes transitions.

# Observed vs proposed

- Desktop geometry, hierarchy, active library nav, populated grid, quota card, filter bar, and pagination are observed.
- Responsive breakpoints, exact focus treatment, dynamic data mapping, empty/error behavior, and media fallbacks are proposed to preserve current product contracts.
- Subject filters shown in the mockup are not supported by current recording metadata. They are deliberately mapped to verified local/cloud/shared filters instead of inventing categories.

# Acceptance checklist

- [ ] `LAYOUT-LIBRARY-01`–`06`: desktop hierarchy and responsive grid match the frozen reference structure.
- [ ] `COLOR-LIBRARY-01`–`02`, `TYPE-LIBRARY-01`, `SURFACE-LIBRARY-01`: coherent light blue/slate visual language with accessible contrast.
- [ ] `ASSET-LIBRARY-01`: the existing `AppSidebar` is reused and active on `/library`.
- [ ] `ASSET-LIBRARY-02`–`03`: durable/data-driven media and code-native icons only.
- [ ] `RESP-LIBRARY-01`: usable at desktop, tablet, and mobile widths.
- [ ] `A11Y-LIBRARY-01`–`02`: labels, keyboard focus, status semantics, and reduced motion are present.
- [ ] All pre-existing preview, download, share, privacy, cursor, delete, load, and refresh handlers remain connected.


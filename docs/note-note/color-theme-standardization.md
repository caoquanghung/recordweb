---
spec_version: 1.0
status: implemented-pending-authenticated-visual-qa
title: Chuẩn hoá accent tím sang theme xanh RecordWeb
evidence_source: current-repository
captured_at: 2026-10-25
repository_commit: ca724a8
target_routes:
  - /dashboard
  - /studio
  - /presentation
  - /library
  - /library/[recordingId]
  - /settings
  - /share/[recordingId]
  - /privacy
---

# Chuẩn hoá màu UI về theme xanh

## 1. Mục tiêu

Chuẩn hoá toàn bộ **brand color và interactive accent** đang dùng tím/indigo về hệ xanh đã được dùng ổn định ở Dashboard và `AppSidebar`.

Specification này đã được triển khai ở presentation layer. Component logic, media pipeline, API, authorization, database và upload flow không thay đổi.

### Quy ước bằng chứng

- **Verified**: xác nhận trực tiếp từ CSS/TSX hiện tại trong repository.
- **Proposed**: quyết định thiết kế cần áp dụng khi triển khai.
- **Deferred**: code không nằm trong luồng UI hiện tại; chưa cần ưu tiên sửa.

## 2. Theme xanh chuẩn

### 2.1. Nguồn chuẩn hiện tại — Verified

Hai nguồn tham chiếu chính:

- `src/components/dashboard/DashboardClient.module.css`
- `src/components/app/AppSidebar.module.css` ở light theme

| Vai trò màu | Giá trị chuẩn | Cách dùng |
| --- | --- | --- |
| Brand chính | `#1d4ed8` | logo, active navigation, text link, primary action nền đậm |
| Primary action | `#2563eb` | CTA nổi bật, nút bắt đầu hoặc xác nhận |
| Primary hover/dark | `#1e40af` | trạng thái hover/pressed trên nền sáng |
| Primary soft surface | `#eff6ff` | nền active nhẹ, selected card, informational surface |
| Primary tint | `#dbeafe` | nền phụ, gradient nhẹ |
| Primary border | `#bfdbfe` | border cho item/card được chọn |
| Primary border strong | `#93c5fd` | hover border hoặc focus hỗ trợ |
| Focus ring | `rgb(37 99 235 / 30%)` | focus-visible và glow có ý nghĩa tương tác |

### 2.2. Semantic tokens đề xuất — Proposed (`COLOR-FOUNDATION-01`)

Không tiếp tục copy các hex tím sang nhiều CSS Module. Tạo một nhóm semantic custom properties dùng chung trong `src/app/globals.css`, sau đó CSS Module chỉ tham chiếu token:

```css
:root {
  --brand-primary: #1d4ed8;
  --brand-primary-action: #2563eb;
  --brand-primary-hover: #1e40af;
  --brand-primary-soft: #eff6ff;
  --brand-primary-tint: #dbeafe;
  --brand-primary-border: #bfdbfe;
  --brand-primary-border-strong: #93c5fd;
  --brand-focus-ring: rgb(37 99 235 / 30%);
}
```

Dark theme cần giữ cùng hue xanh, chỉ tăng độ sáng/alpha để đủ tương phản:

```css
html[data-theme='dark'] {
  --brand-primary: #60a5fa;
  --brand-primary-action: #2563eb;
  --brand-primary-hover: #3b82f6;
  --brand-primary-soft: rgb(37 99 235 / 16%);
  --brand-primary-tint: rgb(37 99 235 / 24%);
  --brand-primary-border: rgb(59 130 246 / 42%);
  --brand-primary-border-strong: #60a5fa;
  --brand-focus-ring: rgb(96 165 250 / 45%);
}
```

Các giá trị dark theme ở trên là đề xuất và phải được kiểm tra contrast/visual trên trình duyệt trước khi chốt.

## 3. Component cần chuyển từ tím sang xanh

### P0 — Luồng chính, nên sửa trước

| ID | Route / component | File | Dấu hiệu tím hiện tại — Verified | Yêu cầu chuyển đổi — Proposed |
| --- | --- | --- | --- | --- |
| `COLOR-STUDIO-01` | Standard Studio và Presentation Studio: `StudioHeader`, `StudioToolbar`, `StudioSourcesPanel`, `StudioStage`, `StudioEffectsPanel`, `PresentationSourcesPanel`, `PresentationStage` | `src/components/studio/StudioShell.module.css` | `--primary: #7c6df2`, `--primary-bright: #9b8cff`, light override `#6756d9/#6654db`; khu vực Studio mới còn dùng indigo `#5367de/#7d8df0`; nhiều border/background/glow `rgba(124, 109, 242, …)` | Thay các token gốc và mọi accent hard-code bằng semantic blue tokens. Bao gồm mode selected, input focus, source selected, presentation upload/replace, camera placeholder/cutout, effect tab/choice/position active, audio active, save preset, drawer active và background glow. |
| `COLOR-STUDIO-DIAG-01` | `StudioDiagnosticsDrawer` | `src/components/studio/StudioDiagnosticsDrawer.module.css` | Primary refresh/CTA dùng border tím và gradient `#7867ec → #5f4ccb` | Dùng `--brand-primary-action`; hover dùng `--brand-primary-hover`; focus dùng `--brand-focus-ring`. Giữ nguyên màu health success/warning/error. |
| `COLOR-STUDIO-REVIEW-01` | `StudioReviewWorkspace` | `src/components/studio/StudioReviewWorkspace.module.css` | Preview glow, icon shadow, source hover và upload/publish CTA dùng tím | Đổi brand glow, hover và CTA sang xanh. Không đổi màu trạng thái upload, lỗi hoặc record. |
| `COLOR-SETTINGS-SHELL-01` | `WorkspaceShell` của `/settings` | `src/components/app/WorkspaceShell.module.css` | `--primary: #7c6df2`, `--primary-bright: #9b8cff`, light overrides tím và radial glow tím | Bỏ palette riêng; dùng semantic blue tokens để Settings cùng màu Dashboard/Sidebar. |
| `COLOR-SETTINGS-CONTROL-01` | `SettingsClient` | `src/components/settings/SettingsClient.module.css` | Card heading button và active theme choice dùng `rgba(124,109,242,…)`; eyebrow kế thừa `--primary-bright` | Chuyển selected/hover/eyebrow sang soft blue, blue border và blue text token. Không thay đổi logic chọn theme hoặc diagnostics. |
| `COLOR-SHARE-01` | Public/authorized share screen | `src/app/share/[recordingId]/share.module.css` | Page glow, brand mark gradient, eyebrow, archive hover, download CTA và empty-state accent dùng tím | Chuyển toàn bộ brand/CTA/focus accent sang blue tokens. Giữ authorization, download permission và trạng thái lỗi nguyên vẹn. |
| `COLOR-GLOBAL-MEDIA-01` | `GlobalMediaControl` | `src/components/media/GlobalMediaControl.module.css` | Drag outline, focus ring, reset hover, source icon và panel ring dùng `#9b8cff`/purple alpha | Chuyển interaction/focus/source accent sang blue tokens; giữ panel surface và drag behavior. |

### P1 — Shared/dark mode, sửa cùng đợt để không còn lệch theme

| ID | Route / component | File | Dấu hiệu lệch hiện tại — Verified | Yêu cầu chuyển đổi — Proposed |
| --- | --- | --- | --- | --- |
| `COLOR-SIDEBAR-DARK-01` | Shared `AppSidebar` dark theme | `src/components/app/AppSidebar.module.css` | Light theme là chuẩn xanh nhưng dark overrides dùng periwinkle `#b9c8ff`, `#c6d2ff`, `#c7d2fe`, `#9eb1ff` và border `#3d52a2/#6077de` | Giữ light theme làm chuẩn; thay dark hover/active/avatar/user text bằng dark blue tokens. Đây là shared component nên phải sửa trước khi visual QA toàn app. |
| `COLOR-LIBRARY-DARK-01` | Library dark theme | `src/components/library/LibraryClient.module.css` | Light theme đã xanh; dark tokens dùng `#8da2ff/#6479e6`, primary card text `#b5c2ff` | Chỉ đổi dark override về blue tokens. Không sửa layout, filter, search, preview, sharing hoặc permission. |
| `COLOR-DETAILS-DARK-01` | Recording Details dark theme | `src/components/library/RecordingDetailsClient.module.css` | Dark `--brand: #9aabff`, `--brand-dark: #6479e6`, `--primary-bright: #8da2ff`; notice/rail/share controls dùng periwinkle | Chỉ đổi brand, notice và controls ở dark theme sang blue tokens. Light theme hiện tại tiếp tục dùng làm reference. |
| `COLOR-PRIVACY-01` | Privacy page | `src/app/privacy/privacy.module.css` | Background glow `rgba(83,103,222,…)`, chip/link/marker dùng `#aab6ff/#7d8df0/#dce2ff` | Đổi brand glow, link và marker sang xanh. Giữ nền tối và khả năng đọc của policy text. |

### P2 — Chỉ sửa nếu component được giữ hoặc tái kích hoạt

| ID | Component | File | Trạng thái | Hướng xử lý |
| --- | --- | --- | --- | --- |
| `COLOR-REVIEW-TOOLS-01` | `RecordedAudioWaveform`, `RecordedCursorTrajectory` | `src/components/review/RecordedAudioWaveform.module.css`, `src/components/review/RecordedCursorTrajectory.module.css` | **Implemented**: đã tái kích hoạt trong `RecordingDeveloperInspection`; không xuất hiện với User | Icon, waveform fill, plot grid và SVG path đã dùng semantic blue inherited từ developer inspection wrapper. |
| `COLOR-LEGACY-NAV-01` | `AppNavigation` | `src/components/app/AppNavigation.module.css` | **Deferred**: legacy navigation, không còn là navigation chính của route hiện tại | Không dành effort chỉ để recolor code chết. Nếu tái sử dụng thì phải chuyển brand gradient, active item và status glow sang xanh trước khi mount. Nếu chắc chắn không dùng nữa, tạo task xoá riêng. |

## 4. Mapping theo nhóm selector của Studio

`StudioShell.module.css` là vùng có độ lệch lớn nhất. Khi triển khai, cần kiểm tra đủ các nhóm sau thay vì chỉ đổi hai biến đầu file:

| Nhóm UI | Selector/state cần rà soát | Mapping đích |
| --- | --- | --- |
| Capture mode | mode card selected, mode badge, active mode border/background | primary text + soft surface + brand border |
| Device/source controls | select focus, source selected, source icon, status ring | primary/focus tokens |
| Preview stage | empty/upload state, camera placeholder, PiP/cutout outline, preview radial glow | blue soft/glow tokens |
| Recording controls | primary CTA, countdown emphasis, active drawer/control | primary action/hover tokens |
| Effects inspector | active tab, selected choice, position selected, audio active | primary text + soft surface + border |
| Preset and drawer | save preset, active tab/drawer button, hover/focus | primary action + soft/focus tokens |
| Integrated presentation shell | `#5367de/#7d8df0` accents, session/header gradient, active drawer, avatar brand half | blue tokens; giữ teal chỉ khi nó biểu thị source/status riêng, không dùng như brand chính |

## 5. Những màu không được đổi hàng loạt

Yêu cầu “tím sang xanh” chỉ áp dụng cho **brand và trạng thái tương tác**. Không search-and-replace mọi màu khác:

- Record/live/destructive: giữ đỏ (`record`, `stop`, `delete`, lỗi nghiêm trọng).
- Success/ready/connected: giữ xanh lá hoặc teal.
- Warning/processing: giữ vàng/amber.
- Neutral surface/text/border: giữ slate/gray hiện tại.
- Màu dữ liệu/media có semantic riêng chỉ đổi khi nó đang đại diện brand accent.
- Không đổi artwork, thumbnail hay nội dung video/canvas.

## 6. Phạm vi file được phép sửa khi implementation

### Presentation layer

- `src/app/globals.css`
- Các CSS Module được liệt kê ở mục 3
- Chỉ sửa `.tsx` nếu cần bỏ inline style màu tím đã được xác minh; không đổi props, event handlers hoặc state transitions.

### Protected — không được chạm trong task đổi theme

- `src/hooks/**`
- recording/session/media/compositor/audio/cursor logic
- `src/app/api/**`, `src/lib/db.ts`, database migrations
- authentication/authorization/permission logic
- upload/storage contracts và environment configuration

## 7. Thứ tự triển khai đề xuất

1. Thêm semantic blue tokens ở `globals.css`; không đổi UI behavior.
2. Chuẩn hoá `AppSidebar` dark theme và `WorkspaceShell` để shared shell thống nhất trước.
3. Đổi toàn bộ Studio shell, Diagnostics và Review; xử lý cả hex, rgb/rgba, gradient, shadow và focus ring.
4. Đổi Settings, Share và Global Media Control.
5. Đổi dark overrides của Library/Recording Details và Privacy page.
6. Chỉ xử lý review tools/legacy navigation nếu chúng còn nằm trong roadmap sử dụng.

## 8. Acceptance criteria

- [x] `COLOR-FOUNDATION-01`: Có một semantic blue palette dùng chung cho light/dark theme.
- [x] `COLOR-STUDIO-01`: Standard Studio và Presentation Studio không còn brand accent tím/indigo.
- [x] `COLOR-STUDIO-DIAG-01`: Diagnostics CTA/focus dùng theme xanh; status colors không đổi.
- [x] `COLOR-STUDIO-REVIEW-01`: Review glow, action và hover dùng theme xanh.
- [x] `COLOR-SETTINGS-SHELL-01` và `COLOR-SETTINGS-CONTROL-01`: Settings đồng nhất với Dashboard/Sidebar ở cả hai theme.
- [x] `COLOR-SHARE-01`: Share screen dùng blue brand/CTA mà không thay đổi download permission.
- [x] `COLOR-GLOBAL-MEDIA-01`: Global Media Control dùng blue focus/drag/source accent.
- [x] `COLOR-SIDEBAR-DARK-01`: Sidebar dark không còn periwinkle palette riêng.
- [x] `COLOR-LIBRARY-DARK-01` và `COLOR-DETAILS-DARK-01`: Library/Details dark dùng cùng hue xanh chuẩn.
- [x] `COLOR-PRIVACY-01`: Privacy brand/link accent dùng xanh.
- [x] `COLOR-REVIEW-TOOLS-01`: Developer waveform/cursor inspection dùng semantic blue, không tái đưa màu tím vào active UI.
- [x] Focus-visible dùng semantic focus ring; các cặp màu brand/CTA chính đạt WCAG AA theo contrast check tĩnh.
- [x] Red/green/amber semantic states giữ nguyên ý nghĩa và độ phân biệt.
- [x] Không có thay đổi trong hooks, media pipeline, API, RBAC, persistence hoặc upload.
- [x] `npm run lint` và `npm run build` pass sau implementation.
- [ ] Visual QA desktop/mobile ở light/dark cho `/dashboard`, `/studio`, `/presentation`, `/library`, `/library/[recordingId]`, `/settings`, `/share/[recordingId]` và `/privacy`.

Visual QA desktop/mobile đã pass cho route công khai `/privacy`. Các route cần Clerk session còn phải kiểm tra trong authenticated browser profile.

## 9. Kiểm tra dư lượng màu tím sau implementation

Chạy audit theo literal cũ, sau đó review từng kết quả còn lại thay vì auto-replace:

```bash
rg -n "7c6df2|9b8cff|6756d9|6654db|7867ec|5f4ccb|9083ff|5f4bd3|5367de|7d8df0|8da2ff|6479e6|9aabff|b9c8ff|c6d2ff|c7d2fe|9eb1ff|124, ?109, ?242|155, ?140, ?255|83, ?103, ?222" src
```

Kết quả chấp nhận được chỉ gồm code **Deferred** đã được ghi rõ hoặc asset/content không đại diện cho UI brand. Mọi kết quả trên route đang active phải được giải thích hoặc chuyển sang semantic blue token.

## 10. Readiness

Implementation đã hoàn tất cho P0/P1. Audit literal cũ chỉ còn kết quả thuộc P2 Deferred (`AppNavigation`, `RecordedAudioWaveform`, `RecordedCursorTrajectory`). Lint, build và Playwright auth E2E đều pass; visual QA đầy đủ trên các route authenticated vẫn đang chờ browser profile có Clerk session.

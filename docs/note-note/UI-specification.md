---
spec_version: 5
status: implemented-core
purpose: Screen-to-component map for role-based UI planning
repository_commit: f58d4da
---

# UI Screen và Component Map

Mục tiêu của tài liệu: xác định screen nào đang dùng component nào và vị trí dự kiến áp dụng role-based UI.

## 1. Quy tắc preview recording

Preview dành cho role `user` chỉ hiển thị **composite recording**:

- Hình ảnh composite từ screen source và webcam/PiP.
- Mixed audio được phát trực tiếp cùng composite video.
- Không hiển thị audio waveform, microphone/system-audio visualization, cursor path hoặc cursor trajectory player.
- Không hiển thị panel preview/chi tiết riêng cho từng source asset.

Quy tắc này áp dụng cho:

- Review sau khi kết thúc recording session trong Studio/Presentation.
- Recording cards và preview dialog trong Library.
- Video player trong Recording Details.

Các asset audio, cursor và clean source vẫn có thể được ghi, lưu và upload theo pipeline hiện tại. Yêu cầu này chỉ thay đổi presentation layer. Việc có tiếp tục cho tải ZIP chứa separate-source assets hay không là quyết định riêng, chưa thay đổi trong tài liệu này.

Developer có thêm `RecordingDeveloperInspection`, được gate bằng `recording-assets:inspect`, sau composite preview tại Studio/Presentation Review, Library preview dialog và Recording Details. Panel hiển thị source-asset inventory, waveform và cursor trajectory khi asset tồn tại; nó không thay đổi ownership/share guard.

## 2. Component dùng chung

| Component | File | Screen sử dụng | RBAC |
| --- | --- | --- | --- |
| `RootLayout` | `src/app/layout.tsx` | Tất cả | Có thể đặt role provider tại đây |
| `MediaSessionProvider` | `src/components/media/MediaSessionProvider.tsx` | Tất cả | Không đặt role logic vào media provider |
| `GlobalMediaControl` | `src/components/media/GlobalMediaControl.tsx` | Hiện trên mọi route nếu media còn active | User và Developer |
| `AppSidebar` | `src/components/app/AppSidebar.tsx` | Dashboard, Studio, Presentation, Library, Details, Settings | Lọc menu theo permission tại đây |
| `WorkspaceShell` | `src/components/app/WorkspaceShell.tsx` | Settings | Chỉ là layout; permission do screen quyết định |

## 3. Screen → Component

| Route / Screen | Component chính | Component bên trong | Role-based UI cần chú ý |
| --- | --- | --- | --- |
| `/` | `Home` | Không có UI; redirect `/dashboard` | Không cần |
| `/dashboard` | `DashboardClient` | `AppSidebar`; recovery banner; hero; recent cards; statistics; quick-start; preset list | User và Developer đều thấy; statistics toàn hệ thống trong tương lai mới dành cho Developer |
| `/studio` | `StudioShell` → `RecordingWorkspace` | `AppSidebar`, `StudioHeader`, `StudioToolbar`, `StudioSessionNotice`, `StudioSourcesPanel`, `StudioStage`, `StudioEffectsPanel`, `StudioReviewWorkspace`, `RecordingDeveloperInspection`, `StudioDiagnosticsDrawer` | User review chỉ có composite; Developer có thêm asset inspection; internal diagnostics chỉ Developer |
| `/presentation` | `StudioShell(initialWorkspace="presentation")` → `PresentationWorkspace` | `AppSidebar`, `StudioHeader`, `StudioToolbar`, `PresentationSourcesPanel`, `PresentationStage`, `StudioEffectsPanel`, `StudioReviewWorkspace`, `RecordingDeveloperInspection`, `StudioDiagnosticsDrawer` | User review chỉ có composite; Developer có thêm asset inspection; internal diagnostics chỉ Developer |
| `/library` | `LibraryClient` | `AppSidebar`, `LibraryRecordingGrid`, `LocalRecordingCard`, `CloudRecordingCard`, `SharedRecordingCard`, `RecordingPreviewDialog`, `RecordingDeveloperInspection`, `SharingDialog` | User preview chỉ có composite; Developer inspection dùng recording đã qua owner/share guard; action vẫn dựa trên owner/`viewer`/`viewer_download` |
| `/library/[recordingId]` | `RecordingDetailsClient` | `AppSidebar`, `StatusPage`, composite video player, `RecordingDeveloperInspection`, share card, chapters, file info | User view không có auxiliary visualization; Developer có thêm inspection nhưng không tự động xem recording của user khác |
| `/settings` | `SettingsClient` | `WorkspaceShell`, `AppSidebar`, theme card, local storage card, cloud diagnostics card, privacy card | Theme/storage/privacy cho cả hai; cloud/internal diagnostics chỉ Developer |
| `/share/[recordingId]` | `SharePage` | Video, metadata, `RecordingArchiveDownloadButton` | Không dựa trên app role; dùng public/owner/`viewer`/`viewer_download` |
| `/sign-in/[[...sign-in]]` | `SignInPage` | Clerk `SignIn` | Public; chưa có role |
| `/sign-up/[[...sign-up]]` | `SignUpPage` | Clerk `SignUp` | Public; tài khoản mới mặc định `user` |
| `/privacy` | `PrivacyPolicyPage` | Static policy article | Public; không cần role |
| `/component/sidebar` | `SidebarShowcase` | `AppSidebar` | Demo nội bộ; nên giới hạn Developer hoặc bỏ khỏi production |

## 4. Component con quan trọng

| Parent | Component con |
| --- | --- |
| `StudioStage`, `PresentationStage` | `AudioMeterPanel` → `AudioLevelMeter` |
| `StudioReviewWorkspace` | Composite preview cho mọi role; mount `RecordingDeveloperInspection` sau preview và để wrapper tự gate permission |
| `LibraryRecordingGrid` | Local, Cloud và Shared card variants |
| `CloudRecordingWaveform` | Không còn được render từ user-facing Library cards |
| `CursorPreviewDialog` | Không còn được render từ user-facing Library |
| `RecordingDetailsClient` | Composite video cho mọi role; Developer có thêm `RecordingDeveloperInspection` |

Audio waveform và cursor components không xuất hiện trong user preview. Nếu giữ lại cho Developer, role check phải nằm ở developer-only UI wrapper; không đặt role logic vào các visualization component hoặc media hooks.

## 5. Component cần sửa khi triển khai role-based UI

| Ưu tiên | Component | Thay đổi |
| --- | --- | --- |
| 1 | `AppSidebar` | Ẩn/hiện developer menu theo permission |
| 2 | `StudioDiagnosticsDrawer` | Tách device preflight khỏi internal diagnostics |
| 3 | `SettingsClient` | Chỉ render cloud/internal diagnostics cho Developer |
| 4 | `StudioReviewWorkspace` | User chỉ thấy composite; mount developer inspection bằng permission wrapper |
| 5 | `LibraryRecordingGrid` / `LibraryClient` | User chỉ thấy composite; truyền inspection data vào preview dialog cho Developer |
| 6 | `RecordingDetailsClient` | User chỉ thấy composite; mount developer inspection sau media card |
| 7 | Developer management screen mới | Chưa tồn tại; chỉ tạo sau khi API quản trị được bảo vệ |
| 8 | `StudioHeader` / `StudioToolbar` | Chỉ sửa nếu thêm nút mở developer tools |

Không thêm role checks vào media hooks, canvas compositor, audio DSP, recording lifecycle hoặc Library ownership/share logic.

## 6. Role-based UI target

| UI area | User | Developer |
| --- | :---: | :---: |
| Dashboard | x | x |
| Recording/Presentation Studio | x | x |
| Library/Recording Details | x | x |
| Composite recording preview | x | x |
| Waveform/cursor/source inspection |  | x |
| Theme, local storage, privacy settings | x | x |
| Device/browser preflight | x | x |
| Internal diagnostics |  | x |
| Telemetry/experimental tools |  | x |
| User/role management |  | x |
| Sidebar showcase/developer pages |  | x |

Ẩn component chỉ phục vụ UX. API và server page tương ứng vẫn phải kiểm tra permission ở server.

Waveform/cursor/source inspection được mount trong developer-only panel sau composite preview; mặc định không xuất hiện với role `user`.

## 7. Source cũ không thuộc screen hiện tại

| Component | Trạng thái |
| --- | --- |
| `PresentationShell` | Không được route hiện tại sử dụng; `/presentation` dùng `StudioShell` |
| `AppNavigation` | Navigation cũ; active screens dùng `AppSidebar` |

## 8. Trạng thái triển khai

- `PermissionProvider`, `usePermission()` và `<Can>` đã được đặt dưới `ClerkProvider`.
- `AppSidebar` hỗ trợ `requiredPermission` cho menu đặc quyền.
- Studio device preflight khả dụng cho cả hai role; Clerk/Neon/Blob diagnostics chỉ render và gọi API cho Developer.
- Settings cloud diagnostics chỉ render cho Developer.
- Studio/Presentation Review, Library preview dialog và Recording Details dùng composite-only preview cho User, đồng thời mount developer-only asset inspection.
- Presentation Studio được phân loại là core cho cả User và Developer.
- Developer management screen chưa nằm trong scope hiện tại.

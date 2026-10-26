# Role-Based Access Control Plan

## 1. Mục tiêu

Thêm quyền cấp ứng dụng cho RecordWeb mà không làm thay đổi các cơ chế ownership và sharing hiện có.

RBAC chỉ quyết định một tài khoản được phép sử dụng nhóm tính năng nào. Quyền trên từng recording, preset hoặc project vẫn phải được kiểm tra riêng bằng `user_id`, `recording_shares.permission` và `recordings.is_public`.

## 2. Phân biệt ba lớp truy cập

### 2.1. App role

App role áp dụng cho tài khoản Clerk đã đăng nhập:

| Role | Mục đích |
| --- | --- |
| `user` | Sử dụng các tính năng ghi hình và quản lý nội dung cá nhân |
| `developer` | Kiểm tra kỹ thuật, telemetry, tính năng thử nghiệm và các chức năng quản trị |

Mọi tài khoản mới mặc định là `user`. Giá trị role thiếu hoặc không hợp lệ cũng phải được xử lý như `user` theo nguyên tắc fail closed.

### 2.2. Resource permission

Các quyền hiện có trên từng recording không phải app role và phải được giữ nguyên:

- `owner`: chủ sở hữu, xác định bằng `recordings.user_id`.
- `viewer`: người được chia sẻ chỉ có quyền xem.
- `viewer_download`: người được chia sẻ có quyền xem và tải xuống.

`developer` không tự động được xem, tải xuống, chỉnh sửa hoặc xóa recording của người khác. Quyền quản lý tài khoản và quyền truy cập chéo recording là hai khả năng khác nhau. Nếu sau này cần truy cập chéo user, phải bổ sung permission riêng và audit rõ ràng.

### 2.3. Anonymous/public access

Người chưa đăng nhập truy cập một recording public là trạng thái anonymous, không phải role `guest`.

Chrome Web Store reviewer nên sử dụng một Clerk test account có role `user`. Nếu reviewer cần một khả năng đặc biệt, bổ sung permission hẹp như `extension:review` thay vì tạo global role `guest`.

## 3. Nguồn dữ liệu role

### 3.1. Source of truth

Clerk `publicMetadata.appRole` là nguồn role chính:

```text
Clerk publicMetadata.appRole
        |
        +-- signed session claim --> server/API và UI authorization
        |
        +-- Clerk webhook ---------> mirror vào Neon users.role
```

- Role chỉ được thay đổi từ Clerk Dashboard hoặc trusted backend sử dụng secret key.
- Không đọc role từ `unsafeMetadata` hoặc dữ liệu do client gửi lên.
- Neon lưu bản mirror để phục vụ query, reporting và audit; session claim là nguồn kiểm tra quyền runtime.
- Khi role thay đổi, session hiện tại có thể cần refresh hoặc đăng nhập lại để nhận claim mới.

### 3.2. Database

Không chỉnh sửa migration đã tồn tại. Vì `0005_recording_projects.sql` đã được tạo, RBAC sử dụng migration kế tiếp:

```text
database/migrations/0006_user_roles.sql
```

Schema dự kiến:

```sql
ALTER TABLE users
ADD COLUMN role VARCHAR(32) NOT NULL DEFAULT 'user';

ALTER TABLE users
ADD CONSTRAINT users_role_check
CHECK (role IN ('user', 'developer'));
```

Migration phải được áp dụng bằng workflow chuẩn:

```bash
npm run db:status
npm run db:migrate
npm run db:verify
```

`src/types/database.ts` phải bổ sung `role` vào `DbUser`. Clerk webhook phải validate `public_metadata.appRole` và upsert role cùng email/display name. Nếu metadata bị xóa hoặc không hợp lệ, webhook phải lưu `user`.

## 4. Permission model

Code không nên kiểm tra trực tiếp `role === 'developer'` ở nhiều nơi. Role phải được chuyển thành permission tập trung.

Permission dự kiến:

| Permission | User | Developer |
| --- | :---: | :---: |
| `recording:use` | x | x |
| `recording-assets:inspect` |  | x |
| `diagnostics:internal` |  | x |
| `telemetry:read` |  | x |
| `experiments:use` |  | x |
| `users:manage` |  | x |

Các tác vụ core như screen recording, webcam, microphone, cursor tracking, Library, preset và sharing nằm trong `recording:use`.

Tạo `src/lib/auth/roles.ts` với các trách nhiệm:

- Khai báo `AppRole` và `AppPermission`.
- Parse và validate role từ signed session claim.
- Ánh xạ role sang permission.
- Cung cấp `hasPermission()` cho logic thuần.
- Cung cấp `requirePermission()` cho server code và Route Handlers.
- Cung cấp response HTTP 403 nhất quán khi tài khoản đã đăng nhập nhưng thiếu quyền.

Giữ `getSessionUserId()` trong `src/lib/auth.ts` để các API hiện hữu không cần refactor đồng loạt. Có thể bổ sung `getAuthContext()` trả về `userId`, `role` và permission khi triển khai RBAC.

## 5. Server-side enforcement

Ẩn UI không phải biện pháp bảo mật. Mọi API hoặc server page đặc quyền phải kiểm tra permission ở server.

Quy ước response:

- `401 Unauthorized`: chưa có Clerk session hợp lệ.
- `403 Forbidden`: đã đăng nhập nhưng thiếu permission.
- `404 Not Found`: phù hợp hơn cho tài nguyên cụ thể khi cần tránh tiết lộ tài nguyên có tồn tại.

`src/proxy.ts` tiếp tục chịu trách nhiệm bảo vệ authenticated route ở mức tổng quát. Permission chi tiết vẫn phải được kiểm tra trong Route Handler hoặc server page; không chỉ dựa vào middleware.

### 5.1. API hiện tại

| Khu vực | Quyền đề xuất |
| --- | --- |
| `/api/recordings` | Authenticated + ownership/share guard hiện tại |
| `/api/presets` | Authenticated + ownership guard hiện tại |
| `/api/recording-projects` | Authenticated + ownership guard hiện tại |
| `/api/shares` | Authenticated + recording ownership hiện tại |
| `/api/upload` | Authenticated; không cho phép client tự khai báo role |
| Clerk webhook | Xác minh webhook signature; không áp dụng user RBAC |
| Internal health/telemetry/administration APIs | Permission tương ứng bắt buộc |

RBAC không được thay thế các câu query có điều kiện `user_id`, permission chia sẻ hoặc kiểm tra public access hiện có.

### 5.2. Diagnostics

Diagnostics hiện tại cần được tách thành:

1. **Device preflight** cho mọi user: camera, microphone, screen capture, MediaRecorder, IndexedDB và khả năng lưu file.
2. **Internal diagnostics** cho `developer`: trạng thái Neon, Vercel Blob, telemetry và thông tin vận hành nội bộ.

Việc phân quyền phải áp dụng từ điểm kích hoạt tới endpoint, không chỉ ở drawer:

| Điểm truy cập hiện tại | Chính sách |
| --- | --- |
| `StudioHeader` — nút kiểm tra thiết bị | Cho cả `user` và `developer`, nhưng chỉ chạy device preflight |
| `StudioHeader` — nút mở internal diagnostics | Chỉ render khi có `diagnostics:internal` |
| `StudioDiagnosticsDrawer` — trạng thái Clerk/Neon/Blob/telemetry | Chỉ render khi có `diagnostics:internal` |
| `SettingsClient` — Cloud & Services diagnostics | Chỉ render và chỉ cho chạy khi có `diagnostics:internal` |
| `/api/health` — trạng thái Neon/Blob | Bắt buộc kiểm tra `diagnostics:internal` ở Route Handler |

`StudioDiagnosticsDrawer` hiện trộn browser capability với trạng thái dịch vụ nội bộ. Khi triển khai RBAC, tách hai nhóm dữ liệu này thành component hoặc view model riêng. Device preflight nên chạy hoàn toàn ở client nếu không cần thông tin server. Không dùng một endpoint internal rồi chỉ ẩn kết quả khỏi `user`.

### 5.3. Bảo vệ direct route

Ẩn liên kết trong `AppSidebar` không ngăn user nhập URL trực tiếp. Các server page đặc quyền phải gọi `requirePermission()` trước khi render.

| Route | Chính sách đề xuất |
| --- | --- |
| `/admin` | Yêu cầu `users:manage` |
| `/component/sidebar` | Yêu cầu `experiments:use`, hoặc loại route khỏi production |
| `/presentation` | Áp dụng theo quyết định phân loại Presentation Studio tại mục 5.4 |

`src/proxy.ts` chỉ tiếp tục làm coarse authentication guard. Không đưa toàn bộ permission matrix vào proxy và không xem proxy là lớp authorization cuối cùng.

### 5.4. Phân loại tính năng thử nghiệm

Trước khi dùng `experiments:use`, mỗi tính năng phải được ghi rõ là **core** hay **experimental**. Không suy ra chỉ từ tên component hoặc trạng thái UI.

Presentation Studio được phân loại là **core** theo `UI-specification.md`: cả `user` và `developer` được dùng, không kiểm tra `experiments:use` tại nút `Tải PDF/PPTX`, direct route `/presentation`, `PresentationSourcesPanel` hoặc `PresentationStage`.

Các option thử nghiệm trong `StudioEffectsPanel` cũng chỉ được gate ở option cụ thể đã được phân loại. Không ẩn toàn bộ Effects panel nếu các chức năng core vẫn nằm trong đó.

Nếu quyết định sản phẩm thay đổi và Presentation trở thành experimental, phải gate đồng thời mọi entry point và direct route; không chỉ ẩn nút trên Studio.

## 6. UI integration

Tái sử dụng cùng component/screen và điều khiển phần đặc quyền bằng permission:

```tsx
<Can permission="diagnostics:internal">
  <InternalDiagnosticsButton />
</Can>
```

UI layer dự kiến gồm:

- Một server-derived auth context hoặc `RoleProvider` nhận role đã được validate.
- Hook `usePermission()` cho client components.
- Component `<Can>` cho các action nhỏ.
- Server-side permission check cho toàn bộ route `/admin`; chỉ `developer` có `users:manage`.

### 6.1. Component cần áp dụng permission

| Component | Trách nhiệm permission |
| --- | --- |
| `AppSidebar` | Ẩn menu developer/experimental; không thay thế direct-route guard |
| `StudioHeader` | Tách device preflight khỏi trigger internal diagnostics |
| `StudioDiagnosticsDrawer` | Chỉ hiển thị dữ liệu vận hành nội bộ cho `developer` |
| `SettingsClient` | Gate Cloud & Services diagnostics bằng `diagnostics:internal` |
| `RecordingDeveloperInspection` | Gate waveform, cursor trajectory và source-asset inventory bằng `recording-assets:inspect` |
| `StudioToolbar` | Presentation là core; không gate theo role |
| `SidebarShowcase` | Không tự quyết định quyền; server page `/component/sidebar` phải bảo vệ route |
| `/admin` components | Chỉ nhận dữ liệu sau server check `users:manage` |

`PresentationShell` và `AppNavigation` đang là legacy/inactive nên chưa cần thêm role logic. Nếu được kích hoạt lại, chúng phải qua cùng permission contract như component đang hoạt động.

### 6.2. Chính sách preview recording

Preview tiêu chuẩn tại Studio/Presentation Review, Library và Recording Details luôn hiển thị composite canvas video với mixed audio cho cả `user` và `developer`.

Với `user`, không render thêm:

- audio waveform hoặc mic/system-audio visualization;
- cursor path hoặc cursor trajectory player;
- panel chi tiết cho webcam, screen hay source-audio asset riêng.

Các auxiliary asset vẫn được record, persist và upload theo pipeline hiện tại. Với `developer`, container của từng screen mount thêm `RecordingDeveloperInspection` sau composite preview khi có `recording-assets:inspect`. Panel này hiển thị danh sách source assets, mixed/microphone/system-audio waveform và cursor trajectory nếu dữ liệu tương ứng tồn tại.

Permission này chỉ mở công cụ visualization sau khi recording đã vượt qua ownership/share/public guard hiện hữu; nó không cấp quyền xem recording của user khác. Quyết định có đưa auxiliary assets vào archive download vẫn là chính sách resource permission riêng, không phải app role.

Các component cần loại bỏ hoặc tách phần visualization khỏi user-facing preview khi triển khai UI:

- `StudioReviewWorkspace`;
- `LibraryRecordingGrid` và `CursorPreviewDialog` được gọi từ `LibraryClient`;
- `RecordingDetailsClient`.

### 6.3. Component không cần app-role permission

Không thêm role check vào các component sau nếu yêu cầu sản phẩm không thay đổi:

- camera, microphone, screen source, recording controls và `GlobalMediaControl` — dùng `recording:use` cho cả hai role;
- theme, profile và các setting cá nhân;
- Library share/download/delete — tiếp tục dựa trên ownership và `viewer`/`viewer_download`;
- `/share/[recordingId]` — tiếp tục dựa trên public/owner/resource permission;
- media hooks, audio DSP, canvas compositor, cursor capture và recording lifecycle.

Role check nên nằm ở route, screen hoặc container sở hữu feature. Component media cấp thấp chỉ nhận props/state đã được screen cho phép.

Yêu cầu UI:

- Trong lúc role chưa xác định, không render chức năng đặc quyền để tránh flash nội dung.
- Không đưa role logic vào media hooks, recording lifecycle, audio DSP hoặc canvas compositor.
- Không đưa role logic vào low-level waveform/cursor renderer; permission phải được quyết định ở screen/container.
- Giữ nguyên props, event handler và state transition của các component ghi hình.
- Hiding chỉ cải thiện UX; API authorization vẫn là lớp bảo vệ bắt buộc.

## 7. Kế hoạch triển khai

### Phase 1 — Contracts và schema

- Chốt `AppRole`, `AppPermission` và permission matrix.
- Tạo `0006_user_roles.sql`.
- Cập nhật `DbUser` và schema verification.
- Thiết lập `publicMetadata.appRole` trong Clerk.
- Đưa role vào signed session claims.

### Phase 2 — Server authorization

- Tạo `src/lib/auth/roles.ts`.
- Cập nhật Clerk webhook để mirror role vào Neon.
- Thêm helper 401/403 thống nhất.
- Bảo vệ `/api/health`, internal diagnostics và các API dành cho developer.
- Bảo vệ server page `/admin` và `/component/sidebar`; giữ `/presentation` là core cho cả hai role.
- Giữ nguyên toàn bộ ownership/share predicate hiện tại.

### Phase 3 — UI authorization

- Thêm auth/permission context cho React.
- Thêm `usePermission()` và `<Can>`.
- Tách device preflight khỏi internal diagnostics tại `StudioHeader`, `StudioDiagnosticsDrawer` và `SettingsClient`.
- Gate menu và trigger tại `AppSidebar`/`StudioToolbar`, đồng thời giữ server page là lớp bảo vệ chính.
- Giữ user preview composite-only; mount developer asset-inspection panel tại Studio/Presentation Review, Library preview và Recording Details.
- Chỉ hiển thị experimental features cho role phù hợp.
- Tạo `/admin` cho developer sau khi API quản trị đã được bảo vệ server-side bằng `users:manage`.

### Phase 4 — Verification và rollout

- Gán thủ công role developer cho các tài khoản nội bộ/quản trị trên Clerk Dashboard; mọi tài khoản còn lại mặc định là user.
- Kiểm tra session refresh sau khi đổi role.
- Chạy migration theo controlled release trước khi deploy code phụ thuộc schema mới.
- Rollout internal features trước, dashboard quản trị dành cho developer sau.

## 8. Acceptance criteria

- User mới mặc định có role `user` trong Clerk flow và Neon mirror.
- Role thiếu hoặc sai giá trị không bao giờ nâng quyền.
- Anonymous viewer chỉ xem được recording public và không tạo row `guest`.
- User gọi API internal nhận 403.
- User gọi trực tiếp `/api/health` nhận 403 dù UI diagnostics đã bị ẩn.
- Developer gọi API internal được phép nhưng không truy cập recording của user khác.
- API quản trị yêu cầu `users:manage`; chỉ role `developer` có permission này.
- User mở trực tiếp `/component/sidebar` bị từ chối hoặc route không tồn tại trong production.
- Presentation Studio được phân loại core và truy cập được bởi cả hai role.
- User preview chỉ có composite video và mixed audio; Developer có thêm asset inventory, waveform và cursor trajectory trong panel được gate bằng `recording-assets:inspect`.
- Ẩn UI đặc quyền không phải cách duy nhất bảo vệ chức năng.
- Direct API call không thể bypass server authorization.
- Các ownership guard của recording, preset, share và project vẫn hoạt động như trước.
- Library share/download/delete tiếp tục dựa trên ownership và resource permission, không dựa trên app role.
- Thay role trên Clerk chỉ có hiệu lực sau khi session claim được refresh đúng cách.

## 9. Test matrix tối thiểu

| Trường hợp | Kết quả mong đợi |
| --- | --- |
| Không đăng nhập gọi protected API | 401 |
| User gọi internal diagnostics API | 403 |
| User gọi trực tiếp `/api/health` | 403 |
| Developer gọi internal diagnostics API | 200 |
| User mở trực tiếp `/component/sidebar` | 403/404 |
| Developer mở `/component/sidebar` | 200 nếu giữ showcase; 404 nếu loại route khỏi production |
| User hoặc Developer mở `/presentation` | Thành công; Presentation là core |
| Developer đọc/xóa recording của user khác | Bị từ chối |
| Developer gọi user-management API | Thành công |
| Role claim không hợp lệ | Xử lý như `user` |
| User gọi thẳng API dù UI đã ẩn action | 403 |
| Anonymous mở private recording | 404 |
| Anonymous mở public recording | Chỉ có quyền public viewer |
| `viewer` tải source assets | Bị từ chối |
| `viewer_download` tải source assets | Thành công |
| User xem Review/Library/Recording Details | Chỉ composite video + mixed audio |
| Developer xem Review/Library/Recording Details | Composite + panel source inventory/waveform/cursor khi asset tồn tại |

Sau khi triển khai, cần chạy `npm run lint`, `npm run build`, các test API authorization và Playwright E2E cho từng role.

## 10. Trạng thái triển khai

Đã hoàn thành trong code:

- permission contract, fail-closed role parser và Route Handler authorization helper;
- migration `0006_user_roles.sql`, database type và schema verification;
- Clerk webhook mirror `publicMetadata.appRole` vào Neon;
- bảo vệ `/api/health` và direct route `/component/sidebar`;
- `PermissionProvider`, `usePermission()` và `<Can>` cho client UI;
- tách device preflight khỏi internal diagnostics;
- composite-only preview tại Review, Library và Recording Details;
- developer-only recording asset inspection tại Review, Library preview và Recording Details;
- authorization unit tests, anonymous E2E checks, lint và production build.

Rollout còn phải thực hiện:

1. Apply migration theo thứ tự `0005` rồi `0006` trên đúng Neon environment.
2. Cấu hình Clerk session token template với claim `{ "metadata": "{{user.public_metadata}}" }`.
3. Gán `publicMetadata.appRole = "developer"` cho tài khoản nội bộ; tài khoản còn lại không cần gán vì mặc định là `user`.
4. Refresh session và chạy authenticated E2E bằng một tài khoản `user` và một tài khoản `developer`.


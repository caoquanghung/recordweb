# Calibration Profile — đặc tả trang hiệu chỉnh dáng đứng của teacher

Trạng thái: **đã triển khai (11/11/2026); xem mục 16 cho kết quả kiểm thử và các điểm khác với bản đặc tả ban đầu**. Nguồn yêu cầu: `docs/note-note/get_profile_data.md` và `image.png`, cùng vòng phỏng vấn ngày 11/11/2026. Các quyết định ở mục 2 đã được người dùng xác nhận; mục 14 ghi các quyết định bổ sung và giả định.

## 1. Mục tiêu và phạm vi

### 1.1 Mục tiêu

Thêm một trang độc lập để mỗi teacher chụp và lưu **9 ảnh posture**: ảnh toàn thân (đã xoá nền) khi teacher đứng chỉ tay vào từng ô của lưới 3×3 trên màn hình. Bộ 9 ảnh cùng toạ độ ô là dữ liệu calibrate cho thuật toán xử lý ảnh chạy sau này, dùng để hiệu chỉnh các video đã quay.

### 1.2 Trong phạm vi

- Trang `/calibration` cho mọi user đã đăng nhập, kèm mục trong `AppSidebar`.
- Webcam riêng của trang, MediaPipe Pose Landmarker (kèm segmentation mask) để phát hiện cơ thể và xoá nền.
- Luồng chụp tuần tự 9 ô với đếm ngược tự động, kiểm tra thấy toàn thân, xem lại và chụp lại từng ô.
- Lưu lên Vercel Blob (upload trực tiếp từ trình duyệt) và Neon (migration `0010`), mỗi user một profile, ghi đè.
- Thông báo quyền riêng tư kèm xác nhận lần đầu và nút xoá toàn bộ profile.
- Xem và tải ZIP profile của mọi user trong `/admin/library` (quyền `recordings:manage`).

### 1.3 Ngoài phạm vi

- Thuật toán xử lý ảnh/hiệu chỉnh video: do người dùng làm riêng. Spec này chỉ định nghĩa **hợp đồng dữ liệu** mà thuật toán sẽ đọc.
- Lưu toạ độ khung xương (landmark). Landmark chỉ dùng tạm trong trình duyệt để kiểm tra chất lượng, **không lưu**.
- Lưu ảnh webcam gốc chưa xử lý, lịch sử phiên bản, nhiều profile có tên.
- Thay đổi Studio, pipeline ghi hình, `/api/upload`, `MediaSessionProvider` và các hook media hiện có (vùng được bảo vệ theo `AGENTS.md`). Xem mục 12 cho các điểm chạm cần phê duyệt.
- Lưu phiên chụp dở dang vào IndexedDB (ảnh chưa lưu chỉ nằm trong bộ nhớ của trang).

## 2. Các quyết định đã chốt

| Chủ đề | Quyết định |
| --- | --- |
| Dữ liệu lưu | Ảnh cutout (xoá nền) và toạ độ ô `(row, col)` với `row, col ∈ {1,2,3}`. Không lưu landmark. |
| Cách chụp | Đếm ngược tự động cho từng ô, người dùng chỉ bấm bắt đầu một lần. |
| Thời gian đếm ngược | Người dùng chọn 3 / 5 / 8 giây, nhớ trong `localStorage`. |
| Nơi lưu | Vercel Blob (ảnh) và Neon (metadata), theo tài khoản. |
| Quyền truy cập | Mọi user đã đăng nhập; developer xem/tải được profile của mọi user ở `/admin/library`. |
| Model AI | `@mediapipe/tasks-vision` Pose Landmarker kèm mask phân đoạn. |
| Ảnh lưu | Crop theo bounding box người, scale chuẩn hoá về chiều cao cố định, nền trong suốt, **không lật gương**. |
| Luồng chụp | Tuần tự, xong cả 9 vào màn xem lại; chọn ô xấu để chụp lại. |
| Kiểm tra toàn thân | Nếu thiếu đầu/chân khi hết đếm ngược: **không chụp, đếm lại** ô đó. |
| Phiên bản | Ghi đè, mỗi user chỉ một profile. |
| Lật gương | Preview lật, ảnh lưu không lật (`mirrored = false`). |
| Tích hợp | Route `/calibration` và mục sidebar. |
| Camera | Trang tự quản lý stream riêng (không dùng `MediaSessionProvider`). |
| Điều kiện lưu | Cho lưu thiếu và đánh dấu chưa đủ. |
| Admin | Có trong v1: xem và tải ZIP trong `/admin/library`. |
| Quyền riêng tư | Notice và xác nhận lần đầu, có nút xoá toàn bộ profile. |
| Tràn ngang | Chiều cao cutout luôn bằng khung trắng; phần tay tràn được vẽ đè lên khung trắng. |

## 3. Quy ước toạ độ ô

- Lưới 3×3 là hình ảnh của màn hình/slide mà teacher chỉ vào, nhìn từ phía người xem màn hình.
- `row` tăng từ trên xuống, `col` tăng từ trái sang phải; ô `(1,1)` là góc trên-trái, `(3,3)` là góc dưới-phải.
- Thứ tự chụp cố định, theo hàng: `(1,1) (1,2) (1,3) (2,1) (2,2) (2,3) (3,1) (3,2) (3,3)`.
- Toạ độ là số nguyên 1–3, lưu thành hai cột `cell_row`, `cell_col` (không dùng tên `row` vì trùng từ khoá SQL).

## 4. Bố cục trang

### 4.1 Tham chiếu từ mock

`image.png` là khung 1920×1080 (16:9). Số đo từ mock:

| Thành phần | Vị trí / kích thước (px) | Tỉ lệ theo khung |
| --- | --- | --- |
| Khung trắng (grid) | x=52, y=88, rộng 1465, cao 835 | trái 2.7%, trên 8.1%, rộng 76.3%, cao 77.3% |
| Vùng xanh (webcam) | x từ 1517 đến 1920, cao bằng khung trắng | rộng khoảng 21% |
| Dải trên khung trắng | y từ 0 đến 88 | dành cho tiêu đề/trạng thái |
| Dải dưới khung trắng | y từ 923 đến 1080 | dành cho điều khiển |

Khung trắng trong mock có tỉ lệ 1465/835 ≈ 1.755, gần nhưng **không đúng** 16:9 (1.778). Triển khai dùng `aspect-ratio: 16 / 9` vì khung đại diện cho màn hình mà teacher chỉ vào. Chênh lệch khoảng 1.3% chiều ngang.

### 4.2 Quy tắc triển khai

- Toàn bộ "stage" là một vùng 16:9 co giãn theo chiều rộng/cao của nội dung (contain), mọi kích thước bên trong dùng phần trăm hoặc đơn vị container (`cqw`/`cqh`) so với stage 1920×1080 tham chiếu; không đặt pixel cố định.
- Trang nằm trong `WorkspaceShell` như Library, nên stage co vào phần nội dung còn lại sau sidebar. Laptop là thiết bị chính; viewport hẹp hơn mức tối thiểu thì thu nhỏ stage theo tỉ lệ thay vì xếp lại layout.
- **Khung trắng (trái)**: hiển thị lưới 3×3 và ô đích. Ô đích được tô nổi bật kèm nhãn `(row, col)`; ô đã chụp có dấu hoàn thành, ô chưa chụp hiển thị trung tính. Trong đếm ngược, số đếm hiển thị lớn tại ô đích.
- **Vùng xanh (phải)**: canvas webcam cutout. Chiều cao hiển thị **bằng chính xác chiều cao khung trắng**, căn cùng mép trên và dưới.
- **Dải dưới**: nút Bắt đầu/Huỷ, bộ chọn đếm ngược 3/5/8 giây, trạng thái kiểm tra toàn thân, nút Lưu.
- **Nền gradient và thẻ trắng** của mock được áp dụng cho stage ở cả chế độ sáng và tối. Thẻ trắng giữ nền sáng cố định vì lưới và số đếm cần độ tương phản cao. Màu thương hiệu lấy từ token xanh dùng chung trong `src/app/globals.css`, không thêm màu cứng ngoài token. Chỉ dùng Vanilla CSS Modules, không Tailwind.

### 4.3 Xử lý tràn ngang

- Chiều cao cutout hiển thị = chiều cao khung trắng. Hệ số scale được tính **chỉ từ khoảng cách dọc** đỉnh đầu đến gót chân, nên tay giơ ngang không làm đổi kích thước.
- Vị trí ngang neo theo **trục thân** (trung điểm vai/hông trong ảnh), căn giữa vùng xanh, nên giơ tay không làm cả người nhảy ngang.
- Phần cutout vượt ra ngoài vùng xanh được vẽ **đè lên khung trắng**. Nền cutout trong suốt nên lưới và ô đích phía sau vẫn nhìn thấy. Canvas webcam vì thế phải rộng hơn vùng xanh và nằm trên lớp (z-index) của khung trắng, với `pointer-events: none`.
- Cutout không bao giờ được cắt cụt ở mép vùng xanh; chỉ bị giới hạn bởi stage.

## 5. Pipeline xử lý ảnh trong trình duyệt

Toàn bộ chạy client-side. Đặt trong hook/module mới của trang (ví dụ `src/hooks/usePoseCutout.ts`, `src/lib/calibration/*`), **không sửa** `useVisionSegmentation`, `useCanvasCompositor` hay các hook media hiện có.

### 5.1 Camera

- Trang tự gọi `getUserMedia` (chỉ video, không audio), ưu tiên 1920×1080 ở 30 FPS, không bật mic.
- Cho chọn thiết bị camera nếu có nhiều camera.
- Dừng toàn bộ track (`track.stop()`) khi rời trang, khi đổi thiết bị, khi huỷ và khi unmount.
- Xử lý lỗi thân thiện: bị từ chối quyền, không có camera, camera đang bị app/tab khác chiếm dụng.
- Vì trang dùng stream riêng, người dùng nên ngắt camera ở Studio trước; trang phải hiển thị thông báo rõ ràng nếu không mở được thiết bị.

### 5.2 Phát hiện cơ thể và mask

- Dùng `PoseLandmarker` của `@mediapipe/tasks-vision` ở `runningMode: "VIDEO"`, `outputSegmentationMasks: true`, `numPoses: 2` (để phát hiện thừa người), mô hình `pose_landmarker_full`. Thử delegate GPU, tự động fallback CPU.
- Suy luận ở khoảng 15 lần/giây là đủ cho preview; khung dùng để chụp lấy từ lần suy luận gần nhất. Cho phép dùng lại `startVisibilityAwareFrameLoop` ở `src/lib/frameScheduler.ts` (chỉ đọc, không sửa).
- Phải `close()` landmarker, huỷ vòng lặp và giải phóng canvas khi unmount để không rò rỉ WebGL context.
- Hiển thị trạng thái tải model (lần đầu có thể mất vài giây) và lỗi thân thiện nếu tải/khởi tạo thất bại.

### 5.3 Cutout

1. Với mỗi khung, lấy confidence mask của người chính.
2. Tính bounding box người từ mask (ngưỡng 0.5): `bboxX, bboxY, bboxW, bboxH` theo pixel của khung camera.
3. Alpha của cutout lấy từ confidence mask, làm mịn viền 1–2 px; ngoài người thì trong suốt hoàn toàn. Thông số làm mịn có thể chỉnh khi triển khai mà không đổi hợp đồng dữ liệu.
4. Preview: bbox dọc (đỉnh đầu, gót chân) và trục thân được làm mượt (EMA, hệ số khoảng 0.2) để cutout không rung. Khung dùng để **lưu** dùng bbox thô của đúng khung đó, không làm mượt.
5. Lật gương chỉ áp dụng ở bước vẽ preview (CSS `transform: scaleX(-1)` hoặc transform canvas); dữ liệu cắt để lưu luôn lấy từ khung không lật.

### 5.4 Kiểm tra thấy toàn thân

Một khung đạt khi **tất cả** điều kiện sau đúng:

- Phát hiện đúng một người (nếu phát hiện từ hai người trở lên thì không đạt, cảnh báo "Chỉ một người trong khung").
- Các điểm mốc đầu (mũi, hai mắt) và hai cổ chân có `visibility` ≥ 0.5 trong khung hình; mỗi bên chân còn cần thấy ít nhất gót hoặc mũi chân.
- Bounding box từ mask không chạm mép trên hoặc mép dưới của khung camera (đệm khoảng 1% chiều cao). Điều kiện này bắt trường hợp đỉnh đầu bị cắt vì đỉnh đầu không có landmark.
- Chiều cao bbox đạt tối thiểu 40% chiều cao khung (người đứng quá xa thì ảnh quá nhỏ).

Trạng thái đạt/không đạt được hiển thị **liên tục** trong lúc xem trước (để teacher chỉnh vị trí trước khi bắt đầu) và được đánh giá lại **ở khung cuối của đếm ngược**. Nếu không đạt, **không chụp**: hiện lý do ("Hãy lùi ra để thấy cả đầu và chân"), rồi đếm ngược lại ô hiện tại. Không giới hạn số lần thử; nút Huỷ luôn khả dụng.

Hai giây cuối của mỗi lần đếm hiển thị nhãn "Giữ yên" (chỉ là chỉ dẫn, không chặn chụp theo chuyển động).

## 6. Ảnh được lưu

Mỗi posture là một ảnh PNG có kênh alpha:

- Crop theo bbox của người (đệm 2% mỗi cạnh, bị chặn trong khung camera).
- Scale đều (giữ tỉ lệ) để **chiều cao bằng đúng 1080 px**; chiều rộng = `round(bboxW × scale)`, giới hạn 120–4096 px (ảnh phóng to từ bbox rộng có thể vượt 1920). Nền trong suốt.
- Không lật gương.
- Dung lượng tối đa mỗi ảnh 8 MB (server từ chối vượt mức; PNG ảnh chụp có alpha ở 1080 px cao thường 1–3 MB).

Chuẩn hoá về chiều cao cố định khiến các tư thế cùng thang đo và thuật toán phía sau so sánh trực tiếp được. Nếu bbox gốc thấp hơn 1080 px, ảnh phải được phóng to (có nội suy) nên mất chi tiết. Vì vậy **luôn lưu kèm** `source_bbox`, `source_width/height` và `scale_factor` để khôi phục kích thước gốc.

### 6.1 Metadata mỗi posture

| Trường | Ý nghĩa |
| --- | --- |
| `cell_row`, `cell_col` | Toạ độ ô, 1–3 |
| `storage_url`, `blob_pathname` | Vị trí ảnh trên Vercel Blob |
| `mime_type`, `file_size_bytes` | `image/png`, kích thước file |
| `width_px`, `height_px` | Kích thước ảnh lưu (`height_px` luôn 1080) |
| `source_width`, `source_height` | Kích thước khung camera gốc |
| `source_bbox` | `{x, y, width, height}` theo pixel khung gốc: **vùng crop thực tế** (bbox người đã đệm 2% và chặn trong khung), để tái tạo chính xác cùng `scale_factor` |
| `scale_factor` | Hệ số từ bbox gốc ra ảnh lưu |
| `mirrored` | Luôn `false` |
| `pose_model` | Tên và phiên bản model (ví dụ `pose_landmarker_full`) |
| `capture_session_id` | UUID của phiên chụp tạo ra ảnh |
| `captured_at` | Thời điểm chụp |

## 7. Luồng và trạng thái của trang

```
consent ─► device-setup ─► ready ─► capturing(cell i) ─► review ─► saving ─► saved
  ▲                         │            │ (không đạt kiểm tra: đếm lại)  │
  └──── profile hiện có ────┘            └──────────────────── chụp lại ô ┘
```

1. **Consent (lần đầu)**: hiển thị thông báo quyền riêng tư (mục 10). Phải tick đồng ý trước khi bật camera. Đã đồng ý rồi (lưu ở server) thì bỏ qua.
2. **Trang chính khi đã có profile**: hiển thị lưới với thumbnail 9 ô đã lưu, độ đầy đủ ("7/9 ô"), thời điểm cập nhật; các nút **Chụp lại toàn bộ**, **Chụp lại ô** (chọn ô), **Xoá profile**.
3. **Device setup**: xin quyền camera, chọn thiết bị, tải model. Hiển thị trạng thái từng bước.
4. **Ready**: preview cutout trực tiếp trong vùng xanh, chỉ báo toàn thân, chọn 3/5/8 giây; bấm **Bắt đầu**.
5. **Capturing**: lặp theo thứ tự cố định: tô ô đích, đếm ngược, kiểm tra, chụp, chuyển ô. Có thể **Huỷ** bất cứ lúc nào (giữ lại những ô đã chụp trong phiên).
6. **Review**: lưới 9 thumbnail (ô chưa chụp để trống). Chọn một ô để chụp lại (quay về Capturing cho đúng ô đó rồi trở về Review). Nút **Lưu** bật khi có ít nhất một ô.
7. **Saving**: tiến độ theo ảnh (n/N), có thể huỷ. Lỗi giữa chừng không làm mất ảnh chưa lưu; có nút thử lại.
8. **Saved**: xác nhận, hiển thị độ đầy đủ; ô thiếu có lối tắt để chụp tiếp.

Ảnh chưa lưu chỉ nằm trong bộ nhớ. Nếu có ảnh chưa lưu, rời trang/đóng tab/đổi route phải hiện cảnh báo xác nhận (có thể theo mẫu của `recordingLeaveWarning.ts`, tạo module riêng, không sửa module Studio). Giải phóng mọi Object URL khi huỷ hoặc unmount.

### 7.1 Hai chế độ lưu

Do "mỗi user một profile, ghi đè" kết hợp với "cho lưu thiếu", có hai chế độ rõ ràng:

- **Chụp lại toàn bộ** (chụp cả phiên từ ô `(1,1)`): khi lưu, **thay toàn bộ profile**. Ô nào chưa chụp trong phiên này bị xoá khỏi profile, nên profile mới có thể thiếu ô và được đánh dấu chưa đủ. Cách này tránh trộn ảnh của hai bối cảnh khác nhau (đổi phòng/vị trí camera) một cách âm thầm.
- **Chụp lại ô** (từ profile hiện có): khi lưu, chỉ thay đúng các ô đã chụp lại, giữ nguyên ô còn lại. Các ô này có `capture_session_id` khác phần còn lại, để thuật toán phía sau nhận ra profile gồm ảnh từ nhiều phiên.

## 8. Mô hình dữ liệu (migration `0010_calibration_profiles.sql`)

Theo `.agents/rules/database_management.md`: file migration mới theo thứ tự, không `BEGIN/COMMIT`, không sửa file đã áp dụng; chạy `npm run db:status`, `db:migrate`, `db:verify`; cập nhật `src/types/database.ts` và `MEMORY.md` trong cùng thay đổi.

### 8.1 `calibration_profiles`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `user_id` | `VARCHAR(128)` PK | FK `users(id)` `ON DELETE CASCADE`; đúng một profile mỗi user |
| `consent_version` | `TEXT NOT NULL` | Phiên bản nội dung notice đã đồng ý |
| `consent_accepted_at` | `TIMESTAMPTZ NOT NULL` | |
| `settings` | `JSONB NOT NULL DEFAULT '{}'` | Ví dụ thông tin camera/model của lần lưu gần nhất |
| `created_at`, `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | |

Hàng profile được tạo khi người dùng đồng ý notice, nên "có profile" không có nghĩa là đã có ảnh. Độ đầy đủ suy ra từ số hàng posture.

### 8.2 `calibration_postures`

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `id` | `UUID` PK | `gen_random_uuid()` |
| `user_id` | `VARCHAR(128) NOT NULL` | FK `calibration_profiles(user_id)` `ON DELETE CASCADE` |
| `cell_row`, `cell_col` | `SMALLINT NOT NULL` | `CHECK BETWEEN 1 AND 3`; `UNIQUE (user_id, cell_row, cell_col)` |
| `storage_url`, `blob_pathname` | `TEXT NOT NULL` | |
| `mime_type` | `TEXT NOT NULL` | `CHECK = 'image/png'` |
| `file_size_bytes` | `BIGINT NOT NULL` | `CHECK` > 0 và ≤ 8 MB |
| `width_px`, `height_px` | `INTEGER NOT NULL` | `height_px = 1080` |
| `source_width`, `source_height` | `INTEGER NOT NULL` | |
| `source_bbox` | `JSONB NOT NULL` | `{x, y, width, height}` |
| `scale_factor` | `NUMERIC(10,6) NOT NULL` | |
| `mirrored` | `BOOLEAN NOT NULL DEFAULT FALSE` | |
| `pose_model` | `TEXT NOT NULL` | |
| `capture_session_id` | `UUID NOT NULL` | |
| `captured_at`, `created_at` | `TIMESTAMPTZ NOT NULL` | |

### 8.3 `calibration_upload_ledger` (sổ theo dõi Blob)

Theo dõi mọi pathname mà server đã cấp token, để dọn blob mồ côi mà không động tới cơ chế upload của recording.

| Cột | Ghi chú |
| --- | --- |
| `blob_pathname` PK, `user_id` | FK `users(id)` `ON DELETE CASCADE` |
| `status` | `pending` (đã cấp token), `committed` (đang được posture dùng), `replaced` (đã bị thay, chờ xoá) |
| `created_at`, `updated_at` | |

Dọn dẹp: blob `replaced` và blob `pending` quá một giờ được xoá bằng `del()` một cách **cơ hội** khi chính user đó gọi lại API calibration (giống cách dọn cơ hội của recording hiện nay). Lỗi xoá được ghi lại và thử lại ở lần sau, không làm hỏng yêu cầu của người dùng. Không thêm cron mới và không sửa cron `recording-uploads/cleanup` trong v1.

## 9. API (Next.js Route Handlers, `src/app/api/calibration/*`)

Mọi endpoint yêu cầu phiên đăng nhập hợp lệ, mọi truy vấn có điều kiện sở hữu `user_id`, giá trị truyền qua tagged template của Neon. Anonymous trả `401`, input sai `400`, thiếu dữ liệu `404`. Lỗi trả thông điệp đã làm sạch, không lộ SQL hay chuỗi kết nối. Phản hồi gửi `Cache-Control: no-store`. Mutation từ origin khác bị từ chối (cùng chuẩn với `/api/admin/*`).

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| GET | `/api/calibration` | Trả `{ profile: null }` hoặc `{ profile: { consentVersion, consentAcceptedAt, updatedAt, completeness, postures: [...] } }`; mỗi posture có metadata ở mục 6.1 và `url` |
| POST | `/api/calibration/consent` | Tạo profile rỗng (idempotent) với `consentVersion` |
| POST | `/api/calibration/upload` | Cấp token upload trực tiếp lên Blob (`@vercel/blob/client`), theo `getBlobClientUploadMethod()` như `/api/upload` |
| PUT | `/api/calibration/postures` | Cam kết kết quả lưu (nguyên tử); body `{ mode: "replace-all" \| "replace-cells", captureSessionId, postures: [{ cellRow, cellCol, pathname, ... }] }` |
| DELETE | `/api/calibration` | Xoá toàn bộ profile, posture và blob |

### 9.1 Upload trực tiếp

- Ảnh **không** đi qua body của Route Handler. Trình duyệt gọi `upload()` của `@vercel/blob/client` với token do `/api/calibration/upload` cấp. Ảnh đều nhỏ hơn giới hạn 4.5 MB, nhưng vẫn theo nguyên tắc của dự án: chỉ upload cloud trực tiếp từ client.
- Dùng endpoint riêng, **không** mở rộng `/api/upload` vì endpoint đó gắn chặt với upload attempt của recording.
- Quy tắc cấp token: pathname phải khớp `calibration/<userId-server>/<uuid>.png` với `userId` lấy từ phiên (không tin client); `allowedContentTypes: ["image/png"]`; `maximumSizeInBytes` 8 MB; `addRandomSuffix: false`; `allowOverwrite: false`; token hết hạn sau một giờ. Mỗi lần cấp ghi một dòng `pending` vào `calibration_upload_ledger`.
- Giới hạn tần suất theo user (đề xuất 60 token/giờ, đủ cho 9 ảnh nhân vài lần chụp lại), mẫu theo rate limiter hiện có.
- Tận dụng cơ chế dự phòng `uploadPresigned` khi không có `BLOB_READ_WRITE_TOKEN`, giống `/api/upload`.

### 9.2 Cam kết nguyên tử (`PUT /api/calibration/postures`)

1. Server xác minh từng pathname thuộc về user và đang `pending` trong ledger, rồi gọi `head()` của `@vercel/blob` để lấy URL, kích thước và content type thật. **Không tin** URL/kích thước do client gửi.
2. Kiểm tra: ô hợp lệ (1–3, không trùng nhau trong cùng yêu cầu), `height_px = 1080`, chiều rộng trong khoảng cho phép, `mirrored = false`, tối đa 9 posture.
3. Trong một giao dịch Neon: upsert posture theo `(user_id, cell_row, cell_col)`; với `replace-all` xoá thêm các ô không có trong yêu cầu; cập nhật `updated_at`; ledger: pathname mới `committed`, pathname cũ bị thay `replaced`.
4. Sau commit: xoá các blob `replaced` bằng `del()` (cố gắng hết sức, lỗi được thử lại sau).
5. Lỗi trước commit giữ nguyên profile cũ; blob đã upload nằm lại `pending` và được dọn sau một giờ.

### 9.3 Quyền riêng tư của dữ liệu

- URL Blob của posture được dùng nội bộ; không có trang chia sẻ, không có liên kết công khai. Ảnh calibration dùng **cùng cơ chế truy cập Blob như recording** (không thêm cơ chế URL ký riêng). Người dùng đã chấp nhận mức bảo mật này (mục 14.2).

## 10. Thông báo quyền riêng tư

Ảnh toàn thân là dữ liệu cá nhân nhạy cảm. Màn đầu tiên của trang (và mỗi khi `consent_version` đổi) phải nêu rõ, bằng tiếng Việt:

- Dữ liệu được lưu: 9 ảnh toàn thân đã xoá nền và toạ độ ô, **không** lưu video hay âm thanh.
- Mục đích: hiệu chỉnh các video bài giảng của chính teacher (nghiên cứu HCI).
- Nơi lưu: Vercel Blob và Neon; ai truy cập được: chính người dùng và quản trị viên (developer) của dự án.
- Camera chỉ bật sau khi tick đồng ý; ảnh chỉ rời trình duyệt khi người dùng bấm Lưu.

Nội dung chính xác và phạm vi consent bằng văn bản với nhóm nghiên cứu cần được người dùng xác nhận (mục 14.3); notice trong app không thay thế consent ngoài app.

## 11. Admin (`/admin/library`)

- Thêm panel thu gọn được **Calibration dáng đứng của user** vào trang admin hiện có (không dùng tab, để không phải tái cấu trúc trang); chỉ hiển thị và chỉ phục vụ khi có quyền `recordings:manage` (kiểm tra ở server, không dựa vào việc ẩn nút).
- Danh sách phân trang các user (tìm theo email/tên), cho mỗi user: độ đầy đủ (n/9), `updated_at`, 9 thumbnail. User chưa có profile vẫn hiển thị (trạng thái "Chưa calibrate").
- Tải ZIP cho một user: `<owner-email>/calibration/<row>-<col>.png` cùng `metadata.json` (toàn bộ metadata ở mục 6.1, `captured_at`, `capture_session_id`, `consent_version`). Dùng lại hợp đồng manifest và `adminDownloadClient` hiện có: `{ name, files: [{ name, url?, text?, size }] }`, byte tải trực tiếp từ Blob, không proxy qua serverless.
- Endpoint mới, cùng chuẩn với `/api/admin/*`: `GET /api/admin/calibration` (`q`, `page`) và `GET /api/admin/calibration/:userId/download`.
- Admin **không** sửa hay xoá profile của user khác trong v1 (chỉ xem/tải).

## 12. Tác động tới vùng được bảo vệ (cần phê duyệt trước khi triển khai)

`AGENTS.md` cấm chỉnh sửa các thành phần bảo vệ nếu chưa được duyệt. Triển khai trang này chạm các điểm sau và cần xác nhận rõ:

| Điểm chạm | Lý do | Rủi ro | Mức |
| --- | --- | --- | --- |
| Migration `0010` và `src/types/database.ts` | Thêm bảng mới | Cần chạy `db:migrate` lên Neon đang dùng | Cộng thêm, không đổi bảng cũ |
| Route Handlers mới `/api/calibration/*` và `/api/admin/calibration*` | Dữ liệu mới | Cần quyền/sở hữu chuẩn xác | Cộng thêm |
| `src/proxy.ts` | Mặc định route mới đã được bảo vệ bởi `auth.protect()` | Không cần sửa nếu không thêm route công khai | Không đổi |
| `AppSidebar.tsx` | Thêm một mục điều hướng | Chỉ thay đổi hiển thị | Thấp |
| `/admin/library` | Thêm panel Calibration | Thêm UI, không đổi hành vi hiện có | Thấp |

Không đụng tới: `/api/upload`, `recordingUploads.ts`, `useRecordingSession`, `useCanvasCompositor`, `useAudioDSP`, `useVisionSegmentation`, `MediaSessionProvider`, EBML patcher và IndexedDB recording cache. Luồng xoá tài khoản (`begin_admin_deletion`, `admin_deletion_jobs`, Clerk webhook) **không được sửa** trong v1 (mục 14.4).

## 13. Phụ thuộc và vận hành

- Thêm `@mediapipe/tasks-vision` (ghim phiên bản chính xác, cùng cách ghim `@mediapipe/selfie_segmentation`). Hai gói tồn tại song song; Studio không đổi.
- Tệp WASM và model `pose_landmarker_full.task` (khoảng vài MB đến trên 10 MB) **tải từ CDN** lúc chạy (mục 14.1): WASM từ jsDelivr theo đúng phiên bản đã ghim của `@mediapipe/tasks-vision`, model từ kho `mediapipe-models` của Google. Không thêm file nhị phân vào repo. Cần hiển thị trạng thái đang tải và lỗi mạng thân thiện khi CDN không truy cập được, kèm nút thử lại. Dự án chưa cấu hình CSP, nên không cần chỉnh header; nếu sau này thêm CSP thì phải cho phép hai host này.
- Trang là client component (`"use client"`); toàn bộ truy vấn DB và token Blob chạy ở Route Handler. `DATABASE_URL` và `BLOB_READ_WRITE_TOKEN` không bao giờ vào bundle client.
- Trước khi viết code Next.js, đọc hướng dẫn tương ứng trong `node_modules/next/dist/docs/` như `AGENTS.md` yêu cầu (Next 16 có thay đổi so với kiến thức cũ).

## 14. Quyết định bổ sung và giả định

Các mục 14.1–14.4 đã được người dùng trả lời ngày 11/11/2026.

### 14.1 Phân phối model và WASM của MediaPipe
**Tải từ CDN** lúc chạy, không self-host (xem mục 13). Đánh đổi đã chấp nhận: repo gọn hơn nhưng trang phụ thuộc dịch vụ ngoài; không có mạng đến CDN thì không khởi tạo được model.

### 14.2 Quyền truy cập Blob cho ảnh
**Giống cơ chế lưu recording**, không dùng URL ký riêng. Người dùng chấp nhận mức này vì đối tượng teacher ăn mặc lịch sự, nên ảnh ít nhạy cảm. Đây là quyết định của người dùng, không phải đánh giá bảo mật của tôi: URL Blob vẫn là liên kết khó đoán nhưng ai có URL đều xem được.

### 14.3 Nội dung consent
Mục 10 là nội dung đề xuất; phạm vi văn bản consent với nhóm nghiên cứu vẫn do người dùng tự rà soát ngoài app.

### 14.4 Xoá tài khoản
**Ngoài phạm vi v1.** Không sửa `begin_admin_deletion`, `admin_deletion_jobs` hay xử lý Clerk webhook. Hệ quả đã được chấp nhận: khi một tài khoản bị xoá, các hàng calibration bị xoá theo qua FK `ON DELETE CASCADE`, nhưng file ảnh calibration trên Blob có thể còn sót lại. Nếu sau này cần dọn, bổ sung một việc riêng (đưa pathname calibration vào manifest xoá hoặc quét theo tiền tố `calibration/<userId>/`).

### 14.5 Giả định về hành vi
- Hai chế độ lưu ở mục 7.1 (**Chụp lại toàn bộ** thay toàn bộ profile; **Chụp lại ô** chỉ thay ô được chụp). Người dùng đã đổi tên chế độ thứ nhất từ "Calibrate mới" thành "Chụp lại toàn bộ" và không phản đối hành vi mô tả.
- Mức lệch tỉ lệ khung trắng 1.755 so với 16:9 (khoảng 1.3%) được chấp nhận; dùng `aspect-ratio: 16 / 9`.
- Ảnh PNG, chiều cao chuẩn 1080 px, đệm 2%, ngưỡng toàn thân và các hằng số khác là mặc định hợp lý, có thể chỉnh khi thử với dữ liệu thật.
- Từ hai người trở lên trong khung thì chặn chụp.
- Stage dùng nền gradient/thẻ trắng của mock ở cả chế độ sáng và tối.
- Ảnh chưa lưu không được giữ qua lần tải lại trang.

## 15. Tiêu chí chấp nhận

1. Người dùng đã đăng nhập mở `/calibration` từ sidebar; anonymous bị chuyển tới đăng nhập.
2. Lần đầu vào, camera không bật cho tới khi tick xác nhận notice; có thể xoá toàn bộ profile.
3. Bố cục khớp mock: khung trắng bên trái chứa lưới 3×3 với ô đích; vùng xanh bên phải hiển thị cutout có chiều cao **đúng bằng** khung trắng ở nhiều kích thước cửa sổ.
4. Giơ tay ngang không làm đổi kích thước hay làm người nhảy vị trí; phần tay tràn được vẽ đè lên khung trắng và lưới vẫn nhìn thấy.
5. Preview lật gương; ảnh lưu không lật (`mirrored = false`) — kiểm tra bằng ảnh có chữ/đồ vật bất đối xứng.
6. Chụp tuần tự 9 ô theo đúng thứ tự mục 3 với đếm ngược 3/5/8 giây theo lựa chọn.
7. Thiếu đầu hoặc chân khi hết đếm ngược: không chụp, hiện lý do và đếm lại ô đó; có người thứ hai trong khung: không chụp.
8. Màn xem lại cho chụp lại bất kỳ ô nào; có thể lưu khi mới có một phần (hiển thị "n/9").
9. Chế độ "Chụp lại toàn bộ" thay toàn bộ profile; "Chụp lại ô" chỉ thay các ô đã chụp lại.
10. Ảnh lưu: PNG có alpha, cao đúng 1080 px, kèm `source_bbox`, `scale_factor`, `capture_session_id`.
11. Upload đi trực tiếp từ trình duyệt lên Blob; không có request nào đưa ảnh qua body của Route Handler. Server kiểm tra pathname/kích thước/loại bằng `head()`.
12. Lỗi giữa chừng khi lưu để nguyên profile cũ; không để lại blob mồ côi sau khi dọn.
13. User A không đọc, ghi, xoá được dữ liệu của user B qua mọi endpoint `/api/calibration*`; user thường nhận `403` ở endpoint admin.
14. Admin xem được danh sách profile và tải ZIP đúng cấu trúc; không có tác vụ xoá tài khoản nào bị thay đổi (mục 14.4).
15. Rời trang/đổi route/huỷ giải phóng toàn bộ `MediaStream` track, landmarker, vòng lặp và Object URL.
16. `npm run build` và `npm run lint` không lỗi mới; `npm run db:verify` đạt sau migration.

## 16. Kết quả triển khai (11/11/2026)

### 16.1 File chính

- Migration `database/migrations/0010_calibration_profiles.sql` (đã áp dụng lên Neon; `npm run db:verify` đạt, script verify kiểm tra thêm ba bảng mới).
- Server: `src/lib/calibration/{policy,server,api}.ts`, `src/app/api/calibration/{route,consent,upload,postures}`, `src/lib/adminCalibration.ts`, `src/app/api/admin/calibration/*`.
- Client: `src/lib/calibration/{geometry,poseLandmarker,client}.ts`, `src/hooks/{useCalibrationCamera,usePoseCutout,useCalibrationSession}.ts`, `src/components/calibration/*`, `src/app/calibration/page.tsx`, `src/components/admin/AdminCalibrationPanel.tsx`.
- Điều hướng: mục "Hiệu chỉnh dáng đứng" trong `AppSidebar` (kèm `public/icons/calibration.svg`).
- Phụ thuộc mới: `@mediapipe/tasks-vision` ghim `0.10.21`; WASM từ jsDelivr, model `pose_landmarker_full` từ kho `mediapipe-models`.

### 16.2 Khác với bản đặc tả ban đầu

- Ảnh tối đa 8 MB, chiều rộng 120–4096 px (bản đầu ghi 3 MB và 1920 px; không đủ cho bbox rộng sau khi phóng to).
- `source_bbox` lưu vùng crop thực tế thay vì bbox trước khi đệm.
- Điều kiện chân nới nhẹ: cần hai cổ chân và, mỗi bên, gót hoặc mũi chân.
- Admin là panel thu gọn trong `/admin/library`, không phải tab.
- `GET /api/calibration/upload` trả thêm `prefix` (`calibration/<userId>/`) để trình duyệt tạo pathname hợp lệ.
- Upload không đăng ký callback hoàn tất, nên **không cần sửa `src/proxy.ts`** để mở route công khai cho Blob.
- Preview được vẽ lên một canvas phủ toàn stage (đơn vị tham chiếu 1920×1080) để tay giơ cao hoặc tràn ngang không bị cắt ở vùng xanh; phép lật gương thực hiện bằng transform trong canvas.
- Thanh điều khiển nằm **dưới** stage 16:9, dải dưới khung trắng chỉ chứa gợi ý và cảnh báo.

### 16.3 Đã kiểm tra

- `npm run build` và `npm run lint` đạt (lint chỉ còn hai cảnh báo cũ trong `StudioShell.tsx`).
- `npm run test:calibration` (10 test: thứ tự ô, pathname theo user, từ chối payload sai, mask/bbox, quy tắc toàn thân, ước lượng đỉnh đầu khi giơ tay, định vị stage), cùng `test:admin-library` và `test:authorization` đạt.
- SQL trên Neon trong giao dịch luôn rollback: upsert theo ô, đánh dấu ledger `replaced`, ràng buộc `mirrored = FALSE`, cascade khi xoá user.
- HTTP ẩn danh: `/calibration` và `/api/calibration*` được proxy chuyển hướng đăng nhập (307), `/api/admin/calibration` trả 401.

### 16.4 Chưa kiểm tra (cần chạy thủ công)

- Camera thật, tải model từ CDN, chất lượng mask khi đứng xa và tay giơ ngang, hiệu năng preview.
- Upload Blob thật qua `/api/calibration/upload`, commit và dọn blob mồ côi (cần `BLOB_READ_WRITE_TOKEN` và phiên Clerk).
- Giao diện admin khi đăng nhập bằng developer; tải ZIP calibration.
- Bố cục stage ở nhiều kích thước cửa sổ, chế độ tối của app.
- Ngưỡng toàn thân và hằng số hình học cần chỉnh theo dữ liệu thật.

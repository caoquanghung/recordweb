# Admin Library — đặc tả và triển khai

Trạng thái: đã triển khai trong source; xem phần kiểm thử và phát hành bên dưới.

## 1. Phạm vi và các lựa chọn triển khai

- Admin và dev dùng chung role `developer` hiện tại; không thêm role `admin`.
- Trang `/admin/library` riêng, sidebar chỉ hiển thị khi có permission `recordings:manage`. Server kiểm tra quyền ở page và từng API. `user` không được truy cập xuyên owner.
- Tái sử dụng `LibraryLayout`, `LibraryToolbar`, `LibraryPagination`, `LibraryCardGrid`, `LibraryRecordingCard`, preview và style Library. Không thay đổi giao diện Library cá nhân ngoài các props tương thích ngược.
- Danh sách quản trị hiển thị mọi row recording trong cloud database, kể cả row thiếu composite; có email chủ sở hữu, tên, ngày ghi và các file hiện có. Xem lại composite và developer inspection khi có dữ liệu tương ứng.
- Tìm theo tên recording/email, lọc theo user, sắp xếp mới/cũ và phân trang server 6 bản ghi/trang. Danh sách user tìm theo email/tên và phân trang 20 user/trang, bao gồm user chưa có recording.
- Chọn bản ghi xuyên trang; có nút tải một file, một ZIP recording, các recording đã chọn và toàn bộ recording của user riêng biệt.
- Có ba nút xoá riêng cho một recording, toàn bộ recordings của user và toàn bộ tài khoản/dữ liệu user.

Các câu hỏi chưa được trả lời ở vòng phỏng vấn thứ hai sử dụng mặc định đã đề xuất: trang admin riêng, xoá tài khoản gồm Clerk và dữ liệu cloud, chặn xoá chính mình/developer khác, nhập email để xác nhận xoá hàng loạt. Quy tắc bảo vệ này áp dụng trong trang/API admin; Library cá nhân vẫn giữ quyền owner hiện tại.

## 2. Ma trận thao tác

| Thao tác | Developer | User |
| --- | --- | --- |
| Liệt kê, xem và tải recording của toàn bộ user | Có | Không |
| Xoá recording/dữ liệu của user thường | Có | Không |
| Xoá chính mình hoặc developer khác qua API admin | Không | Không |
| Quản lý recording của chính mình qua Library hiện tại | Giữ nguyên | Giữ nguyên |

Role của người gọi lấy từ Clerk-signed session claims. Trước mỗi đợt xoá, kiểm tra lại role hiện tại của tài khoản đích từ Clerk và mirror Neon để bảo vệ developer. Không dựa vào việc ẩn nút phía client để phân quyền. API mutation từ origin khác bị từ chối.

## 3. API riêng theo từng tác vụ

Mọi endpoint dưới đây yêu cầu `recordings:manage`; anonymous trả `401`, user thường trả `403`. Dữ liệu trả về không được cache chung giữa tài khoản.

| Method | Endpoint | Tác vụ / input |
| --- | --- | --- |
| GET | `/api/admin/recordings` | Danh sách; query `q`, `userId`, `page`, `sort=newest` hoặc `oldest`; trả `recordings`, `total`, `page`, `pageSize` |
| GET | `/api/admin/users` | Tìm/chọn user; query `q`, `page`; trả `users`, số recording mỗi user, `total`, `pageSize` |
| GET | `/api/admin/recordings/:recordingId/assets/:kind/download` | Manifest tải một file; `kind`: composite, webcam, screen, audio, microphone-audio, system-audio, cursor |
| GET | `/api/admin/recordings/:recordingId/download` | Manifest ZIP một recording |
| POST | `/api/admin/recordings/download` | Manifest các recording đã chọn; JSON `{ "ids": ["uuid", "..."] }`, tối đa 100 ID/yêu cầu; client tự chia nhiều yêu cầu |
| GET | `/api/admin/users/:userId/recordings/download` | Manifest toàn bộ recording của user theo từng 100 bản ghi; query `cursor`, `snapshotAt` cho các trang tiếp theo |
| DELETE | `/api/admin/recordings/:recordingId` | Xoá một recording và file liên quan |
| DELETE | `/api/admin/users/:userId/recordings` | Xoá toàn bộ recording; JSON `{ "confirmEmail": "email@..." }` |
| DELETE | `/api/admin/users/:userId` | Xoá tài khoản Clerk và dữ liệu cloud; JSON `{ "confirmEmail": "email@..." }` |
| GET | `/api/admin/deletions` | 50 tác vụ xoá gần đây; ưu tiên tác vụ chưa hoàn tất |
| POST | `/api/admin/deletions/:jobId/retry` | Tiếp tục/thử lại một tác vụ xoá đã xác nhận |

API download trả `{ name, files: [{ name, url?, text?, size }], nextCursor?, snapshotAt? }`; API xoá/retry trả `{ job }`. Download endpoint chỉ trả metadata/danh sách file; trình duyệt tải byte trực tiếp từ Blob, không proxy video qua serverless.

ID/input sai trả `400`, dữ liệu không tồn tại trả `404`, bản ghi được chọn đã biến mất hoặc có tác vụ xoá khác trên cùng user trả `409`. Lỗi dịch vụ không trả raw SQL hoặc thông tin kết nối. Tác vụ xoá lỗi giữa chừng trả trạng thái `failed` trong `job` để UI có thể tiếp tục cùng tác vụ.

## 4. Định dạng tải xuống

- ZIP tổ chức theo `<owner-email>/<recording-id>-<recording-title>/` để không trùng tên giữa user hoặc recording cùng tiêu đề.
- Mỗi thư mục chứa `metadata.json` (email/owner, thời gian, settings và metadata asset) cùng toàn bộ file hiện có. Recording cũ chỉ có `storage_url` vẫn được tải như composite.
- Tải toàn bộ user giữ `snapshotAt` để bỏ qua recording được tạo sau khi bắt đầu lượt tải. Đây là duyệt phân trang qua dữ liệu đang tồn tại, không phải database snapshot bất biến trước các thao tác xoá đồng thời.
- Chrome/Edge có File System Access: chọn nơi lưu ngay từ click và ghi stream ZIP trực tiếp ra đĩa. Không gom toàn bộ media vào một Blob trong RAM.
- Trình duyệt thiếu khả năng ghi stream ra đĩa: fallback Blob giới hạn 256 MB, vượt giới hạn sẽ dừng và hướng dẫn dùng Chrome/Edge.
- Có tiến độ theo tên file và nút huỷ tải; fetch/stream nhận abort signal. File không tải được khiến lượt tải báo lỗi thay vì bỏ qua âm thầm.

## 5. Phạm vi và xác nhận xoá

| Tác vụ | Dữ liệu bị xoá | Dữ liệu được giữ |
| --- | --- | --- |
| Một recording | Row recording, assets, file Blob, liên kết share/project segment của recording; huỷ upload cùng recording/local ID | Tài khoản, recording khác, preset và project |
| Toàn bộ recordings của user | Toàn bộ recording và file liên quan tại thời điểm tác vụ bắt đầu, kể cả file trong upload manifests | Tài khoản, preset và project; các project bị ảnh hưởng tăng revision |
| Tài khoản và dữ liệu | Tài khoản Clerk; row user cùng recording/assets, presets, projects, shares và upload attempts qua cascade; toàn bộ file Blob đã được lập manifest | Bản sao trên thiết bị user; tombstone tác vụ xoá tối thiểu để retry/cleanup |

- Một recording: hộp thoại hiện tiêu đề/email và nút xác nhận xoá vĩnh viễn.
- Xoá toàn bộ recordings hoặc tài khoản: hiện email/phạm vi/số bản ghi và yêu cầu nhập đúng email.
- Tombstone giữ actor ID, target ID/email, phạm vi, ID recording, danh sách đường dẫn Blob, tiến độ và thời điểm; không giữ nội dung media. Đây là dữ liệu vận hành cần cho retry, chống webhook đến muộn và cleanup, chưa có chính sách xoá lịch sử tự động.
- Admin không thể đọc hoặc xoá IndexedDB, local backup hay file đã tải trên máy user qua API cloud. User còn tài khoản có thể chủ động upload bản sao local mới sau khi tác vụ xoá recordings đã hoàn tất.

## 6. Luồng xoá bền vững và upload cạnh tranh

1. `begin_admin_deletion` khoá row user, kiểm tra email/role và chụp danh sách recording/file/upload manifest vào `admin_deletion_jobs` trong transaction.
2. Mỗi user chỉ có một tác vụ chưa hoàn tất. Gửi lại cùng phạm vi tái sử dụng tác vụ đó; phạm vi khác trả conflict.
3. Upload attempts trong phạm vi được chuyển sang `cancelled`. Database triggers phối hợp cùng khoá user để chặn recording/asset/upload mới thuộc phạm vi đang xoá, kể cả completion chạy cạnh tranh.
4. Worker nhận lease 2 phút, xoá tối đa 200 đường dẫn mỗi lượt. File đã xoá có thể được xoá lại an toàn khi retry. Metadata chưa bị xoá trước khi các đợt xoá file hoàn tất.
5. Với xoá tài khoản, worker xoá Clerk rồi hoàn tất Neon. Webhook có thể cascade Neon trước worker: manifest không có FK tới user nên vẫn còn để cleanup/retry. Mirror guard bỏ qua Clerk create/update đến muộn cho tài khoản đã có tombstone account.
6. Sau khi hoàn tất, giải phóng chặn ghi cho xoá recording/recordings. Xoá account giữ tombstone chống tái tạo cùng Clerk identity.
7. UI tiếp tục các lượt `pending`; khi lỗi, hiện `failed` và nút tiếp tục. Đóng trang không mất tiến độ; request bị ngắt giữ lease tới lúc hết hạn để có thể nhận lại.
8. Callback Blob dùng tombstone để xoá file đến muộn sau khi user/upload row đã biến mất. Cron cleanup hiện có tiếp tục tác vụ và quét lại file tới sau thời hạn upload token thêm một ngày, kèm một lượt quét cuối sau mốc đó.

Neon, Blob và Clerk không có distributed transaction. Lỗi giữa chừng có thể để một phần file đã bị xoá; UI phải hiển thị trạng thái cần retry, không hứa rollback media đã xoá.

## 7. Các module chính

- `src/app/admin/library/page.tsx`: server permission gate.
- `src/components/admin/`: UI, xác nhận xoá, chọn nhiều recording và controller fetch/download/delete.
- `src/lib/adminLibrary.ts`: auth/error/input boundary và query danh sách.
- `src/lib/adminLibraryPolicy.ts`: quyền tác động lên user, validation ID, manifest/filename.
- `src/lib/adminDownloads.ts`, `adminDownloadClient.ts`: chọn dữ liệu tải và stream xuống đĩa.
- `src/lib/adminDeletions.ts`: manifest bền vững, lease, Blob/Clerk/Neon và cleanup.
- `src/app/api/admin/`: endpoint riêng từng tác vụ.
- `database/migrations/0009_admin_library.sql`: job table, snapshot function, guards và indexes.
- Luồng upload callback và cron cleanup hiện có chỉ thêm tích hợp tombstone; API owner hiện tại giữ ownership và hợp đồng cũ. Recording/capture/compositor/DSP không thay đổi.

## 8. Kiểm thử và phát hành

- Unit: `npm run test:admin-library`, `npm run test:authorization` — quyền tất cả endpoint, bảo vệ developer, cross-origin mutation, validate input và cấu trúc ZIP.
- PostgreSQL: `npm run test:admin-database` — fixture trong transaction luôn rollback, Blob/Clerk được mock. Bao gồm query vượt 50 recording, export vượt 100, ba phạm vi xoá, email sai, conflict, upload/completion đến muộn, lỗi Blob/Clerk, retry và webhook cascade. Nếu `0009` chưa có, test áp dụng nó trong transaction rồi rollback.
- Regression: `npm run test:recording-storage`, `npm run test:cloud-cache`, `npm run test:upload-database`.
- Browser: `npm run test:e2e` — bao gồm anonymous admin access bị chặn.
- Static/production: `npm run lint`, `npm run build`.
- Phát hành schema theo runner chuẩn: `npm run db:status`, `npm run db:migrate`, `npm run db:verify`; không chạy migration trong Vercel build.
- Dùng Clerk signed-session metadata claim/role `developer` hiện có, các biến Blob/Clerk/Neon hiện có và `CRON_SECRET` cho cron. Không thêm biến môi trường mới.
- Kiểm tra thủ công bằng tài khoản developer và user thường: sidebar, mobile/dark theme, preview, từng kiểu tải và xác nhận xoá. Kiểm tra Blob/Clerk thật chỉ với tài khoản/bản ghi thử nghiệm; các test tự động không xoá dữ liệu thật.

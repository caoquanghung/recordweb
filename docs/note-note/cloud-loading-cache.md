# Cache dữ liệu cloud khi chuyển trang

## Luồng trước đây

Dashboard, Library và Recording Details tự gọi `GET /api/recordings` với `cache: 'no-store'` mỗi lần mount. Studio và Dashboard tải presets riêng. Card cloud tạo lại thẻ video để lấy frame đầu sau mỗi lần chuyển trang.

## Luồng hiện tại

`CloudLibraryProvider` nằm trong root layout, giữ cache metadata theo tài khoản trong suốt phiên điều hướng client. `cloudLibraryCache` quản lý hai resource độc lập: recordings và presets.

- Lần đầu cần dữ liệu: gửi một GET.
- Nhiều component cần cùng resource cùng lúc: dùng chung Promise đang chạy.
- Chuyển Dashboard → Library → chi tiết → Dashboard: dùng lại metadata có sẵn, không gửi GET chỉ vì đổi trang.
- Danh sách rỗng cũng được cache.
- **Đồng bộ ngay**: gửi GET mới nhưng giữ danh sách cũ trong lúc chờ; lỗi refresh không xoá dữ liệu đang xem.
- Lỗi lần tải đầu có thể thử lại; lỗi không được coi là một lần tải thành công.
- Đổi tài khoản/đăng xuất: provider chuyển sang instance cache khác, không chuyển dữ liệu giữa người dùng.
- F5, mở tab mới hoặc điều hướng tải lại toàn bộ document: metadata được tải lại. Cache này không phải chế độ offline.

## Cập nhật sau thao tác ghi

- Upload/khôi phục cloud thành công: đưa recording trả về vào cache đã tải.
- Lưu tên thành công: cập nhật recording cùng assets hiện có.
- Xoá thành công: loại recording khỏi cache ở mọi màn hình đang dùng chung provider.
- Lưu preset thành công: cập nhật cache presets từ response, không GET toàn danh sách lần nữa.
- GET đã bắt đầu trước một thao tác ghi không được ghi đè tên mới hoặc làm sống lại bản đã xoá.
- Thông báo storage giữa các tab cùng origin yêu cầu refresh resource đã dùng khi có thay đổi cloud. Không refresh chỉ vì chuyển trang hoặc focus tab.

## Thumbnail và video

`RecordingPoster` dùng chung cho card local và cloud. Ảnh JPEG nhỏ được tạo khi card gần viewport, xử lý lần lượt và cache trong IndexedDB.

Ảnh cloud được định danh bằng tài khoản, recording ID, URL video và phiên bản thuật toán thumbnail. Khi quay lại card, đọc ảnh cache thay vì mở lại decoder từ cloud. Video chỉ preload metadata rồi được giải phóng sau khi tạo ảnh. Bộ tạo ảnh đợi decoded-frame callback (có timeout dự phòng), kiểm tra pixel và bỏ qua frame đen/rỗng; nếu cần chỉ tìm tại các mốc 0,05 / 0,2 / 0,5 / 1 giây gần đầu video, giới hạn theo thời lượng clip. Chỉ cache ảnh có nội dung.

Phiên bản thumbnail **2** tự bỏ qua cache cũ (bao gồm ảnh đen từ thuật toán trước), không xoá recording hay yêu cầu người dùng clear IndexedDB. Khi xoá recording, ảnh cache được xoá và tombstone ngăn decoder đến muộn ghi lại ảnh. Nếu không tạo được thumbnail, card hiện nền mặc định cùng thông báo thay vì một thẻ video đen; nút Xem lại vẫn mở video gốc.

Không tải toàn bộ video/audio vào RAM cache và không tạo cache video trùng IndexedDB. Player, tải ZIP và các asset phục vụ developer vẫn đọc media khi cần. Public Blob có cache ở CDN và browser theo [tài liệu Vercel](https://vercel.com/docs/vercel-blob/public-storage#caching); không bảo đảm mọi request Range của playback đều biến mất.

Dashboard đếm local recording bằng danh sách key IndexedDB, không đọc lại mọi Blob chỉ để tính số lượng.

## Kiểm tra

- `npm run test:cloud-cache`: 7 test cho request deduplication, owner isolation, refresh, lỗi/retry và race GET với save/delete/cross-tab invalidation.
- `npm run test:recording-storage`: 49 test cho storage, title, thumbnails, cursor và upload policies, gồm chờ decoded frame, bỏ frame đen và giới hạn seek với clip rất ngắn.
- Chromium với MP4 và WebM thật có đoạn mở đầu đen xác nhận thumbnail có nội dung, cache đen phiên bản cũ được tạo lại, local/cloud dùng chung renderer và file video gốc giữ nguyên.
- Chromium cô lập, dùng component thật và IndexedDB thật, mock Clerk/API và phục vụ WebM có Range: một GET recordings và một GET presets qua các lần chuyển trang; refresh chủ động tạo GET mới; mutation cập nhật cache; card đã cache không request frame lại; xoá cập nhật Dashboard/Library và ngăn late thumbnail writes.
- Build/lint được ghi ở `MEMORY.md`. Authenticated deployment và header CORS của Blob thực tế vẫn cần QA trên môi trường triển khai.

Luồng hiện tại là **backup đầy đủ trên máy trước, rồi mới upload cloud**.

1. **Trong lúc recording:** các chunk video/audio được checkpoint vào IndexedDB. Nếu tab bị tắt đột ngột, có thể khôi phục đến lần ghi thành công gần nhất; draft này chưa đảm bảo có cursor đầy đủ.

2. **Sau khi Stop:** hệ thống hoàn thiện video, sửa duration WebM, gom cursor JSON và waveform. Toàn bộ file được backup vào IndexedDB **trước khi cho phép upload**.

3. **Vào màn hình post-recording:** tự động tạo một phiên upload:
   - **Vercel Blob** lưu các file video, audio, cursor.
   - **Neon** lưu trạng thái upload, danh sách file và metadata.
   - File đi trực tiếp từ trình duyệt lên Blob.
   - Chỉ sau khi mọi file hoàn tất và được kiểm tra, server mới ghi recording cùng các asset vào Neon bằng thao tác nguyên tử, có chống trùng.

4. **Nếu thoát giữa chừng:**
   - Chọn **Ở lại** → tiếp tục upload.
   - Xác nhận **Thoát** → huỷ upload và yêu cầu server xoá file thuộc phiên chưa hoàn tất; giữ nguyên backup local.
   - Nếu cloud đã hoàn tất trước khi yêu cầu huỷ đến, recording đã lưu được giữ nguyên.
   - Việc dọn file khi đóng tab là best-effort; phiên hết hạn và cron sẽ xử lý phần còn sót.

5. **Mở lại Dashboard:** mục bài giảng gần đây hiển thị tối đa ba bản mới nhất theo ngày quay, gộp cloud và draft local, không hiển thị trùng cùng một recording. Nút đỏ **“Lưu bài giảng ngay”** mở **Bài giảng chưa lưu** (`/pending-recordings`) để xem toàn bộ backup, tìm kiếm theo ngày quay, xem trước, lưu lại hoặc xoá có xác nhận. Sidebar có mục Dashboard và đánh dấu trang đang mở bằng nền xanh, vạch cạnh trái và chấm active. Mục Bài giảng chưa lưu chỉ hiện khi còn backup, chỉ badge số lượng có màu đỏ và không nhấp nháy. **Lưu lại bản ghi** mở `/studio?recover=<id>` và tự upload lại từ đầu; nếu cloud đã lưu thì dùng lại recording đó.

6. **Lưu tên và hoàn tất:** người dùng có thể lưu tên vào IndexedDB trong lúc upload. Trước khi ghi metadata, client đọc tên mới nhất; nếu tên được lưu khi metadata POST đang chạy, client cập nhật Neon sau khi upload hoàn tất. Chỉ xoá draft khôi phục sau khi đồng bộ tên cloud và lưu bản local đầy đủ thành công.

Ảnh card trên Dashboard và Bài giảng chưa lưu lấy từ **khung hình đầu của video composite local**. Ảnh JPEG nhỏ (tối đa 480×270) được tạo khi card gần vùng nhìn thấy, xử lý lần lượt và cache trong IndexedDB theo tài khoản. Thumbnail không kích hoạt upload; video không giải mã được vẫn hiện ảnh mặc định.

7. **Xoá backup:** sau một lần xác nhận, ứng dụng huỷ upload attempt nếu có, dùng cơ chế dọn file của server hiện tại, rồi xoá draft, recovery index, bản local và thumbnail cùng ID bằng một transaction IndexedDB. Recording cloud đã hoàn tất được giữ nguyên. Nếu không huỷ được attempt, giữ backup và báo lỗi để thử lại. Danh sách và sidebar cập nhật ở cả tab hiện tại và các tab cùng website.

Backup local phụ thuộc vào **cùng trình duyệt/profile và địa chỉ website**, chưa bị xoá dữ liệu. Cron cleanup đã có trong code nhưng cần cấu hình `CRON_SECRET` trên Vercel; luồng ngắt mạng/upload thực tế vẫn cần kiểm thử trên deployment.

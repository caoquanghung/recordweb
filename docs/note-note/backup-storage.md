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

5. **Mở lại Dashboard:** nút đỏ **“Lưu bài giảng ngay”** đưa đến đúng bản backup trong màn hình post-recording và tự upload lại. Đây là **upload lại từ đầu**, không tiếp tục từ phần trăm cũ. Nếu cloud đã lưu nhưng trình duyệt chưa nhận phản hồi, hệ thống dùng lại recording đó.

6. **Hoàn tất:** sau khi cloud lưu thành công, người dùng xác nhận tên và bản local đầy đủ được lưu thành công, hệ thống mới xoá backup khôi phục.

Backup local phụ thuộc vào **cùng trình duyệt/profile và địa chỉ website**, chưa bị xoá dữ liệu. Cron cleanup đã có trong code nhưng cần cấu hình `CRON_SECRET` trên Vercel; luồng ngắt mạng/upload thực tế vẫn cần kiểm thử trên deployment.
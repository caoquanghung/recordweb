sử dụng Browser + Native Helper để lấy được cursor path

Sử dụng Electron Helper

Lưu lại cursor trajectory 24Hz vào 1 file output và có thể mở lại sau khi record.


Sau này có thể mở rộng:
- nội suy các điểm bên trong các cursor sample để render mượt mà cursor path.

## Kiến trúc đã triển khai

- `electron/main.cjs`: lấy cursor toàn cục bằng Electron `screen`, chạy sampler ở main process tại 24 Hz.
- `electron/preload.cjs`: chỉ expose các lệnh cursor cần thiết qua `contextBridge`; không expose trực tiếp `ipcRenderer` hoặc Node API.
- `src/hooks/useCursorTrajectory.ts`: kết nối UI/browser với helper và giữ display được chọn.
- `useRecordingSession`: dùng cùng session ID và cùng lifecycle start/pause/resume/stop; thời gian pause không xuất hiện trong timeline cursor.
- Output: `<sessionId>-cursor.json`, tọa độ chuẩn hóa theo display đã capture. File được lưu trong IndexedDB cùng recording và có thể mở lại ở Review/Local Library; Library cũng có nút `Open cursor JSON` để mở lại file đã tải về.

## Cách chạy local

1. Chạy web app: `npm run dev`.
2. Ở terminal khác, chạy desktop wrapper: `npm run desktop`.
3. Trong Sources, chọn `Cursor capture display`, sau đó connect screen và recording như bình thường.

Có thể đặt `RECORDWEB_URL=https://...` để wrapper mở bản deploy. URL từ xa bắt buộc dùng HTTPS.

## Giới hạn hiện tại

- Tracking chính xác áp dụng cho `Entire screen`/display đã chọn. Window hoặc browser tab không có absolute bounds đáng tin cậy nên cursor asset sẽ bị bỏ qua và UI hiển thị warning.
- Electron `screen.getCursorScreenPoint()` không hỗ trợ Wayland; cần chạy XWayland/X11 hoặc bổ sung native portal integration cho Linux Wayland.
- Cursor JSON hiện được finalize và lưu local sau khi stop; incremental crash recovery và cloud upload cho asset `cursor` chưa được triển khai.


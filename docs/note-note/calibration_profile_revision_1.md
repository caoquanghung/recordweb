# Thiết lập dáng chỉ tay — đặc tả thay đổi đợt 1

Trạng thái: **đã triển khai (12/11/2026); xem mục 13 cho kết quả, nguyên nhân gốc của lỗi preview và phần chưa kiểm tra.** Tài liệu này sửa và thay thế các phần tương ứng của [calibration_profile.md](calibration_profile.md); phần nào không được nhắc ở đây giữ nguyên.

Nguồn: bốn vấn đề người dùng báo sau khi dùng bản đầu tiên (không có preview camera, cần fullscreen khi chụp, thuật ngữ gây khó hiểu, không cần bắt buộc thấy cổ chân), cùng chỉnh sửa ngày 12/11/2026 về quy tắc hông (tối thiểu qua hông, thấy đến chân thì giữ hết) cùng hai vòng phỏng vấn. Mục 11 liệt kê các giả định do tôi chọn và cần bạn xác nhận.

## 1. Tóm tắt thay đổi

| # | Thay đổi | Mục |
| --- | --- | --- |
| 1 | Camera bật bằng nút riêng ở màn chính; xem trước hiện ngay trong vùng xanh; luôn có hình dự phòng khi model chưa nhận ra người | 2, 3 |
| 2 | Bấm **Bắt đầu chụp** (một nút duy nhất) thì vào toàn màn hình suốt lượt chụp, thoát khi sang màn xem lại | 4 |
| 3 | Đổi toàn bộ thuật ngữ "calibrate / hiệu chỉnh" sang "thiết lập dáng chỉ tay" kèm lời giải thích mục đích | 5 |
| 4 | Tối thiểu phải thấy từ đầu đến qua hông (không bắt buộc cổ chân); nếu camera thấy đến chân thì giữ nguyên cả chân, không cắt ở hông; preview scale phần thấy được cao bằng slide, dịch ngang để không mất phần nào | 6, 7 |
| 5 | Thêm hai cột dữ liệu để phân biệt ảnh toàn thân cũ với ảnh đến hông mới (migration `0011`) | 8 |

## 2. Vòng đời camera (sửa mục 5.1 và 7 của bản gốc)

### 2.1 Hành vi hiện tại và lý do sửa

Hiện camera chỉ bật khi bấm "Bắt đầu calibrate", và model chỉ tải khi phiên bắt đầu, nên màn chính không có xem trước. Người dùng báo: camera bật (đèn sáng) nhưng vùng xanh chỉ có chữ chờ/trạng thái, không có hình.

### 2.2 Quyết định

- Camera **không còn gắn với phiên chụp**. Có nút **Bật camera** ngay trên màn chính. Chỉ bật sau khi người dùng đã đồng ý thông báo quyền riêng tư (như cũ).
- Model nhận diện tải khi camera bật (không đợi bắt đầu phiên).
- Khi camera bật, xem trước hiện trong vùng xanh ngay trên màn chính, kể cả khi chưa bắt đầu chụp.
- **Camera tự tắt khi phiên kết thúc**: sau khi lưu xong, sau "Thoát không lưu", và khi rời trang. Camera **vẫn bật** từ lúc chụp xong ô cuối sang màn xem lại, vì cần chụp lại từng ô.
- Khi camera đang bật mà chưa trong phiên, có nút **Tắt camera**.
- Đổi thiết bị camera vẫn dùng ô chọn hiện có; mọi track phải `stop()` khi tắt, đổi thiết bị, kết thúc phiên và unmount.

### 2.3 Điều tra nguyên nhân "chỉ có chữ" (làm trước khi sửa giao diện)

Triệu chứng người dùng chọn là "vùng xanh chỉ có chữ chờ/trạng thái". Chưa biết đó là lỗi hay chỉ do model chưa chạy. Khi triển khai phải **tái hiện và ghi lại nguyên nhân** thay vì chỉ thêm hình dự phòng:

1. Chạy trang với camera thật, mở console và network: kiểm tra WASM và `pose_landmarker_full.task` có tải được từ CDN không, `modelState` chuyển `loading` sang `ready` hay kẹt ở `loading`/`error`.
2. Nếu model sẵn sàng: kiểm tra `result.landmarks` và `result.segmentationMasks` có dữ liệu không, mask có kích thước/giá trị đúng kỳ vọng (độ tin cậy 0–1), và `isPersonPose` có trả `false` khi người đứng trong khung.
3. Ghi kết quả vào mục 13.1 của tài liệu này và sửa lỗi gốc nếu có. Hình dự phòng (mục 3.2) giải quyết trải nghiệm nhưng **không** thay cho việc sửa lỗi này.
4. Hiển thị trạng thái rõ ràng thay cho dòng "Đang chờ camera và model": "Đang mở camera…", "Đang tải model…", "Model không tải được. Kiểm tra mạng rồi bấm Tải lại model", "Không thấy người trong khung hình".

## 3. Xem trước trong vùng xanh

### 3.1 Giao diện màn chính

Vùng xanh bên phải khung trắng luôn có nội dung khi camera đang bật. Nếu camera tắt, hiện lời nhắc "Bấm Bật camera để xem trước".

### 3.2 Hình dự phòng (quyết định: "Hiện webcam gốc lật gương")

- Khi camera đã chạy nhưng model **chưa sẵn sàng**, hoặc model **chưa thấy người**, vùng xanh hiện **hình webcam gốc, lật gương**.
- Khi model nhận ra người, thay bằng ảnh đã xoá nền như hiện tại.
- Tránh nhấp nháy: chỉ chuyển từ ảnh xoá nền về webcam gốc khi không thấy người liên tục ít nhất 500 ms; chuyển ngược khi thấy người trở lại.
- Cách vẽ webcam gốc (giả định, xem mục 11): căn giữa vùng xanh, cao bằng khung trắng, cắt theo kiểu "cover" ở giữa khung hình để vừa chiều rộng vùng xanh. Mục đích chỉ là cho người dùng thấy mình và chỉnh vị trí đứng; ảnh lưu không bao giờ lấy từ hình dự phòng.
- Vẫn lật gương **chỉ ở phần hiển thị**; ảnh lưu không lật.

### 3.3 Vòng lặp xem trước

Vòng lặp xem trước chạy khi camera bật, không phụ thuộc model: khi model chưa sẵn sàng chỉ vẽ webcam gốc; khi model sẵn sàng thì suy luận (khoảng 15 lần/giây) và vẽ ảnh xoá nền khi thấy người.

## 4. Chế độ toàn màn hình (quyết định: suốt lượt chụp, thoát khi xem lại)

### 4.1 Phạm vi

- Phần tử toàn màn hình là một **khung bao** chứa stage 16:9 và một thanh điều khiển gọn. Không đưa cả sidebar hay tiêu đề trang vào.
- Vào toàn màn hình **trong cùng thao tác bấm** (user gesture) của nút **Bắt đầu chụp**, rồi chạy lượt chụp.
- Chụp lại một ô từ màn xem lại (bấm vào ô) cũng vào toàn màn hình rồi thoát.

### 4.2 Thoát

| Tình huống | Hành vi |
| --- | --- |
| Chụp xong ô cuối của lượt | Thoát toàn màn hình, sang màn xem lại |
| Bấm **Huỷ chụp** | Thoát toàn màn hình, giữ các ô đã chụp trong phiên |
| Nhấn **Esc** hoặc thoát bằng cách khác của trình duyệt | Coi như huỷ lượt chụp, giữ các ô đã chụp |
| Lỗi camera/model làm dừng lượt | Thoát toàn màn hình và hiện lỗi |
| Rời trang | Thoát và dọn dẹp |

Việc thoát do chương trình không được tính là Esc của người dùng (dùng cờ để `fullscreenchange` không huỷ lượt chụp hai lần).

### 4.3 Thanh điều khiển trong toàn màn hình

Chỉ có tiến độ ("Ô 3/9") và nút **Huỷ chụp**. Không có bộ chọn đếm ngược, không hộp thoại xác nhận trong lúc chụp (hộp thoại `<dialog>` không đáng tin trong toàn màn hình). Cảnh báo chất lượng ("Hãy lùi ra để thấy ít nhất từ đầu đến hông") vẫn hiện trên stage.

### 4.4 Bố cục

Stage hiện đo bằng `calc((100vh - 250px) * 16 / 9)`. Trong toàn màn hình, stage phải vừa khít vùng nhìn thấy: chiều rộng = `min(100vw, (100vh − chiều cao thanh điều khiển) × 16/9)`. Dùng biến CSS cho phần trừ để dùng chung hai chế độ. Nền khung bao dùng cùng gradient của stage để dải thừa hai bên không bị đen trắng đột ngột.

### 4.5 Dự phòng

Nếu trình duyệt không hỗ trợ hoặc từ chối toàn màn hình, **vẫn tiếp tục chụp ở chế độ thường** và hiện thông báo ngắn "Không bật được toàn màn hình, vẫn tiếp tục chụp". Không chặn người dùng.

## 5. Thuật ngữ và giải thích mục đích (quyết định: nói theo bước thiết lập)

Người dùng cuối là giảng viên chưa biết mục đích kỹ thuật. Cách gọi mới: **"thiết lập dáng chỉ tay"**.

### 5.1 Bảng đổi chữ

| Vị trí | Hiện tại | Mới |
| --- | --- | --- |
| Mục sidebar | Hiệu chỉnh dáng đứng | Thiết lập dáng chỉ tay |
| Tiêu đề trang | Hiệu chỉnh dáng đứng | Thiết lập dáng chỉ tay |
| Nhãn nhỏ trên tiêu đề | Calibration | Thiết lập |
| Mô tả dưới tiêu đề | "Chụp 9 tư thế chỉ tay… để hiệu chỉnh các video bài giảng đã quay." | "Chụp 9 ảnh khi bạn chỉ tay vào từng phần của slide, để hệ thống hiểu bạn đang chỉ vào đâu khi xử lý video bài giảng." |
| Nhãn đếm | `x/9 ô` | `x/9 ô đã lưu` |
| Nút bắt đầu lần đầu | Bắt đầu calibrate | **Bắt đầu chụp** (nút gộp, xem mục 2) |
| Nút làm lại tất cả | Chụp lại toàn bộ | **Thiết lập lại toàn bộ** |
| Nút làm lại một ô | Chụp lại | Chụp lại ô r,c (giữ nguyên) |
| Nút lưu | Lưu n ô | **Lưu thiết lập (n ô)** |
| Nút xoá | Xoá toàn bộ profile | **Xoá thiết lập đã lưu** |
| Hộp thoại xoá | "Xoá toàn bộ profile?" | "Xoá thiết lập đã lưu?" |
| Thông báo lưu | Đã lưu x/9 ô calibration. | Đã lưu thiết lập (x/9 ô). |
| Thông báo xoá | Đã xoá toàn bộ profile calibration. | Đã xoá thiết lập đã lưu. |
| Lỗi tải | Không thể tải profile calibration. | Không thể tải thiết lập đã lưu. |
| Cảnh báo rời trang | "ảnh calibration chưa lưu" | "ảnh thiết lập chưa lưu" |
| Thông báo quyền riêng tư | "ảnh calibration", "profile" | "ảnh thiết lập dáng chỉ tay" |
| Panel admin | Calibration dáng đứng của user | Thiết lập dáng chỉ tay của user |
| Admin: trạng thái/nút | Chưa calibrate / Tải ZIP calibration | Chưa thiết lập / Tải ZIP thiết lập |

Không đổi: đường dẫn `/calibration`, API `/api/calibration/*`, tên bảng, tên biến, tên file mã nguồn, `MEMORY.md`. Đây là định danh nội bộ; người dùng cuối không nhìn thấy.

### 5.2 Khối giải thích 3 bước (quyết định: trên stage)

Một dải ngắn ngay trên stage, luôn hiện ở màn chính và màn xem lại, **ẩn khi đang chụp** (và vì vậy không có trong toàn màn hình):

> **Thiết lập này dùng để làm gì?** Hệ thống chụp ảnh bạn khi chỉ tay vào từng phần của slide, để hiểu bạn đang chỉ vào đâu. Slide được chia thành lưới 9 ô (3×3).
> 1. Bấm **Bật camera**.
> 2. Đứng cách camera để thấy **ít nhất từ đầu đến hông** (thấy cả người cũng được).
> 3. Bấm **Bắt đầu chụp**, rồi chỉ tay vào ô được tô sáng khi đang đếm ngược.

Bước nào hoàn thành thì đánh dấu (bước 1 khi camera chạy). Các gợi ý trong khung (hint) và thông báo chất lượng cũng đổi "đầu và chân" thành "ít nhất từ đầu đến hông".

## 6. Quy tắc "đủ người trong khung" (sửa mục 5.4 của bản gốc)

### 6.0 Nguyên tắc: hông là mức tối thiểu, không phải giới hạn cắt

- **Chấp nhận** chỉ khi camera thấy được từ đầu đến **qua hông**. Đây là điều kiện tối thiểu.
- Nếu người đứng xa hơn và camera thấy được đến đùi, gối hay tận chân thì **lấy hết phần thấy được**. Hệ thống **không bao giờ cắt ảnh ở hông**: ảnh lưu và preview luôn gồm mọi phần cơ thể mà mask nhận ra, từ đỉnh đầu đến điểm thấp nhất.
- Thấy được càng nhiều (ví dụ cả chân) thì chỉ ảnh hưởng đến nhãn `body_coverage` (mục 6.4), không ảnh hưởng việc ảnh có được chấp nhận.

### 6.1 Điều kiện mới

Một khung đạt khi **tất cả** đúng:

- Đúng một người.
- Mũi và hai mắt có `visibility` ≥ 0.5 và nằm trong khung (đầu).
- **Hai điểm hông** (landmark 23 và 24) có `visibility` ≥ 0.5 và nằm trong khung, **và đường hông nằm trên mép dưới khung ít nhất 3% chiều cao khung** (`HIP_BOTTOM_MARGIN = 0.03`), để khung camera thật sự đi *qua* hông chứ không chỉ chạm hông ở mép.
- Đỉnh đầu/tay không bị cắt ở mép trên (mask không chạm mép trên, đệm 1%).
- Độ dài đầu→hông (từ đỉnh đầu ước lượng đến trung điểm hai hông, mục 7.2) ≥ 15% chiều cao khung hình (hằng số `MIN_HEAD_HIP_RATIO`, chỉnh được).

### 6.2 Bỏ

- Điều kiện cổ chân, gót, mũi chân.
- Điều kiện chân/thân dưới bị cắt ở mép dưới (`clipped-bottom`). Người được phép đứng sao cho khung camera cắt ngang đùi.
- Điều kiện `too-small` cũ (bbox ≥ 40% chiều cao khung); thay bằng độ dài đầu→hông ở trên.

### 6.3 Mã lỗi và thông báo

| Mã | Thông báo |
| --- | --- |
| `no-person` | Không thấy người trong khung hình. |
| `multiple-people` | Chỉ một người được đứng trong khung hình. |
| `head-hidden` | Chưa thấy đầu. Hãy lùi ra để thấy ít nhất từ đầu đến hông. |
| `hips-hidden` (thay `feet-hidden`) | Chưa thấy hông. Hãy lùi ra để thấy ít nhất từ đầu đến hông. |
| `clipped-top` | Đầu hoặc tay bị cắt ở mép trên. Hãy lùi ra để thấy ít nhất từ đầu đến hông. |
| `too-small` | Bạn đứng quá xa. Hãy tiến lại gần hơn một chút. |

Bỏ `feet-hidden` và `clipped-bottom` khỏi kiểu `QualityIssue`.

### 6.4 Phân loại độ phủ cơ thể

Mỗi ảnh chụp được gắn `body_coverage`:

- `full`: **đồng thời** thấy hai cổ chân (và, mỗi bên, gót hoặc mũi chân) **và** mask không chạm mép dưới. Đây chính là quy tắc toàn thân cũ.
- `hips`: mọi trường hợp còn lại đã qua quy tắc 6.1 (thấy qua hông nhưng chưa thấy hết chân).

Cả hai loại đều được lưu **nguyên phần thấy được** (mục 8.1); nhãn chỉ cho thuật toán phía sau biết ảnh có chân hay không.

## 7. Scale và vị trí xem trước (sửa mục 4.3 và 5.3 của bản gốc)

### 7.1 Quy tắc (cập nhật lần 2, 12/11/2026: phủ hết chiều dọc của slide, dịch ngang thay vì thu nhỏ)

Lịch sử: bản đầu đặt chiều cao phần nhìn thấy bằng chiều cao khung trắng nhưng căn theo trục thân nên **mất phần bên phải** khi dang tay; bản sửa thứ nhất (cả người vừa trong vùng xanh) lại làm người **quá nhỏ**, vì người thấy đến ngực rộng hơn nhiều so với vùng xanh nên bị giới hạn bởi chiều rộng. Quy tắc hiện hành kết hợp hai yêu cầu: chiều dọc phải phủ hết slide, và không phần nào của người bị cắt.

- **Chiều dọc:** phần cơ thể camera thấy được, từ đỉnh đầu ước lượng đến điểm thấp nhất của mask (gồm chân nếu thấy), được scale để **cao đúng bằng chiều cao khung trắng (slide)**. Điểm thấp nhất đặt đúng đáy khung trắng. Tay giơ cao hơn đầu **không** tính vào chiều cao này.
- **Chiều ngang:** người căn giữa vùng xanh **nhưng không bị vùng xanh giới hạn bề rộng**. Nếu cần, người được **dịch sang trái vừa đủ** để cả hai phía nằm trong stage (lề `STAGE_EDGE_MARGIN` = 16 đơn vị): phần dư ra bên trái đè lên khung trắng, phần bên phải không bao giờ vượt mép stage.
- **Hai giới hạn an toàn** để không bỏ phần nào: scale không vượt mức khiến tay giơ cao hơn đầu chạm mép trên của stage, và không vượt mức khiến bề rộng người lớn hơn stage. Hai giới hạn chỉ phát huy trong tình huống cực đoan (tay giơ rất cao, dang rất rộng).
- Làm mượt (EMA 0.3) đỉnh đầu và đáy để preview ổn định; các giới hạn an toàn và việc dịch ngang luôn dùng bbox của khung hiện tại nên không có khung nào bị cắt.

Hệ quả chấp nhận: người đè lên mép phải của khung trắng và che một phần các ô ngoài cùng bên phải của lưới trong lúc chụp (nền cutout trong suốt).

### 7.2 Ước lượng đỉnh đầu không dùng bàn chân

Bản gốc ước lượng từ mũi và bàn chân. Nay dùng mũi và trung điểm hông:

```
headToHip = hipMidY − noseY
headTopY  = max(noseY − 0.157 × headToHip, maskTopY)
```

Hằng số 0.157 suy ra từ tỉ lệ nhân trắc: mũi ở khoảng 93.5% chiều cao đứng, hông ở khoảng 52%, nên khoảng cách mũi→hông bằng 0.415 chiều cao và mũi→đỉnh đầu bằng 0.065 chiều cao (0.065 / 0.415 ≈ 0.157). Đây là xấp xỉ; chỉnh khi thử với dữ liệu thật. Cũng làm mượt (EMA) như cũ.

`headToHipPx` dùng ở mục 8 là `hipMidY − headTopY` (đơn vị: pixel khung camera gốc).

## 8. Dữ liệu lưu (sửa mục 6, 8, 9 của bản gốc)

### 8.1 Ảnh (quyết định: "Giữ 1080 px + thêm cột loại")

Không đổi cách crop và chuẩn hoá: crop theo bbox của mask (đệm 2%, chặn trong khung), scale đều để cao đúng 1080 px, nền trong suốt, không lật gương. Khác biệt duy nhất: bbox được phép chạm mép dưới của khung camera. Ảnh luôn gồm **toàn bộ phần cơ thể mà mask nhận ra** (qua hông, đùi, gối hoặc đến tận chân tuỳ khoảng cách đứng); không có bước cắt ở hông.

### 8.2 Migration `0011_calibration_body_coverage.sql`

Thêm cột vào `calibration_postures` (không sửa `0010`):

| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| `body_coverage` | `TEXT NOT NULL DEFAULT 'full'` | `CHECK IN ('full', 'hips')`; hàng cũ tự thành `full` |
| `head_to_hip_px` | `NUMERIC(10,3) NULL` | `CHECK (head_to_hip_px > 0)`; hàng cũ `NULL`; ảnh mới luôn có giá trị |

Chạy `npm run db:status`, `db:migrate`, `db:verify`; mở rộng kiểm tra trong `scripts/db-migrate.mjs` để xác nhận hai cột; cập nhật `src/types/database.ts`.

### 8.3 API và kiểu

- `CalibrationPostureInput` và `CalibrationPosture` thêm `bodyCoverage: 'full' | 'hips'` và `headToHipPx: number | null`.
- `parseCalibrationCommit` yêu cầu `bodyCoverage` hợp lệ và `headToHipPx` là số trong khoảng (0, `sourceHeight`]. Thiếu hai trường trả 400 với thông điệp "Hãy tải lại trang rồi thử lại" (trường hợp tab đang mở bằng mã cũ).
- `commitCalibrationPostures` ghi hai cột; `getCalibrationProfile` trả chúng.
- `adminCalibration.downloadAdminCalibration` thêm `body_coverage` và `head_to_hip_px` vào `metadata.json` của ZIP.
- Ảnh cũ (`full`, không có `head_to_hip_px`) giữ nguyên, thuật toán phía sau nhận ra bằng cột `body_coverage`.

## 9. Luồng màn hình sau thay đổi

| Trạng thái | Điều khiển | Ghi chú |
| --- | --- | --- |
| Màn chính, camera tắt | **Bật camera** (chính); **Bắt đầu chụp** bị vô hiệu kèm gợi ý "Hãy bật camera trước" | Khối giải thích 3 bước hiện |
| Màn chính, camera/model đang tải | Trạng thái "Đang mở camera…/Đang tải model…" | Hình dự phòng hiện ngay khi camera chạy |
| Màn chính, camera và model sẵn sàng | **Tắt camera**; bộ chọn camera (nếu >1); đếm ngược 3/5/8 giây; **Bắt đầu chụp** (lần đầu) hoặc **Thiết lập lại toàn bộ** (đã có dữ liệu) | Một nút duy nhất vào toàn màn hình và bắt đầu đếm ngược |
| Màn chính, đã chọn một ô trong lưới | Thêm nút **Chụp lại ô r,c** | Bấm ô chỉ **chọn** (tô khung), không tự vào toàn màn hình, tránh bấm nhầm |
| Đang chụp (toàn màn hình) | Tiến độ, **Huỷ chụp** | Không bộ chọn, không khối giải thích |
| Xem lại | Bấm ô để chụp lại (vào toàn màn hình, xong thoát); **Thoát không lưu**; **Lưu thiết lập (n ô)** | Camera vẫn bật |
| Đang lưu | Thanh tiến độ, **Huỷ lưu** | |
| Sau khi lưu / thoát | Camera tự tắt, về màn chính | |

Bước `ready` của phiên bị bỏ: màn chính chính là trạng thái chuẩn bị, bấm **Bắt đầu chụp** chạy thẳng hàng đợi chụp. Chế độ lưu ở mục 7.1 của bản gốc (thay toàn bộ / chỉ thay ô được chụp lại) giữ nguyên; "Thiết lập lại toàn bộ" tương ứng "Chụp lại toàn bộ" cũ.

## 10. Tác động tới mã và phạm vi bảo vệ

### 10.1 File dự kiến sửa

- `src/hooks/useCalibrationSession.ts`: tách vòng đời camera khỏi phiên; bỏ bước `ready`; thêm `enterFullscreen`/`exitFullscreen` và xử lý `fullscreenchange`; tự tắt camera khi kết thúc phiên.
- `src/hooks/usePoseCutout.ts`: vòng lặp chạy khi camera bật; vẽ webcam gốc dự phòng; dùng quy tắc hông và công thức scale mới; trả `bodyCoverage` và `headToHipPx` khi chụp.
- `src/lib/calibration/geometry.ts` và `tests/unit/calibration.test.mjs`: quy tắc 6.1, `QualityIssue` mới, `estimateHeadTop` dựa trên hông, phân loại `body_coverage`.
- `src/lib/calibration/policy.ts`, `src/lib/calibration/server.ts`, `src/types/calibration.ts`, `src/types/database.ts`, `src/lib/adminCalibration.ts`: hai trường dữ liệu mới.
- `database/migrations/0011_calibration_body_coverage.sql`, `scripts/db-migrate.mjs`.
- `src/components/calibration/CalibrationClient.tsx`, `CalibrationStage.tsx`, hai file CSS Modules: luồng mới, khung bao toàn màn hình, khối 3 bước, đổi chữ.
- `src/components/app/AppSidebar.tsx` (nhãn), `src/components/admin/AdminCalibrationPanel.tsx` (chữ).
- `docs/note-note/calibration_profile.md`: ghi chú tham chiếu tới tài liệu này; `MEMORY.md`.

### 10.2 Vùng được bảo vệ

Không đụng Studio, pipeline ghi hình, `/api/upload`, `MediaSessionProvider`, `src/proxy.ts`. Điểm chạm duy nhất cần lưu ý: **migration `0011`** (cộng thêm cột, có giá trị mặc định, không xoá hay đổi dữ liệu).

## 11. Giả định và việc còn mở

1. **Nguyên nhân "chỉ có chữ"** đã được xác định bằng thực nghiệm trong Chromium (mục 13.1); vẫn cần xác nhận lại trên camera và GPU thật của bạn.
2. **Cách vẽ webcam gốc dự phòng** (cover ở giữa vùng xanh): do tôi chọn. Nếu người đứng lệch tâm có thể bị cắt trong hình dự phòng; phương án thay thế là "contain" (vừa chiều rộng, nhỏ hơn).
3. **`MIN_HEAD_HIP_RATIO` = 0.15**, **`HIP_BOTTOM_MARGIN` = 0.03** và hằng số **0.157** là giá trị khởi đầu, cần chỉnh theo dữ liệu thật. `HIP_BOTTOM_MARGIN` là cách tôi hiểu "qua hông": hông phải cách mép dưới khung một khoảng nhỏ.
4. **Nút "Chụp lại ô r,c"** giữ cách gọi "chụp lại" thay vì "thiết lập lại ô", vì đây là hành động đơn giản dễ hiểu; có thể đổi nếu bạn muốn nhất quán hoàn toàn.
5. **Bấm ô ở màn chính chỉ chọn ô**, không tự vào toàn màn hình (cần thêm bấm "Chụp lại ô r,c"); tôi chọn để tránh bấm nhầm.
6. **Camera tắt tự động sau khi lưu/thoát** theo quyết định của bạn; vẫn bật trong màn xem lại để chụp lại ô.
7. Khối giải thích 3 bước và mô tả mới (mục 5) là **văn bản đề xuất của tôi**, cần bạn rà soát giọng văn.
8. Dữ liệu đã lưu trước thay đổi vẫn hợp lệ và được coi là `full`; không cần bắt giảng viên chụp lại.

## 12. Tiêu chí chấp nhận

1. Khi vào trang (sau khi đã đồng ý quyền riêng tư), camera **chưa** bật; bấm **Bật camera** thì hình xem trước hiện trong vùng xanh trong vòng 1 giây (webcam gốc lật gương nếu model chưa sẵn sàng).
2. Khi model nhận ra người, vùng xanh chuyển sang ảnh xoá nền; khi mất người, về webcam gốc sau 500 ms, không nhấp nháy.
3. Có thể điều tra và giải thích được nguyên nhân triệu chứng "chỉ có chữ"; nếu là lỗi mã thì đã sửa, kèm test hoặc ghi chú tái hiện.
4. **Bắt đầu chụp** vào toàn màn hình trong cùng thao tác bấm và bắt đầu đếm ngược ô (1,1); stage vừa khít màn hình mà không cuộn; chỉ có tiến độ và **Huỷ chụp**.
5. Esc trong lúc chụp huỷ lượt và giữ các ô đã chụp; chụp xong ô cuối tự thoát toàn màn hình sang màn xem lại.
6. Bấm một ô ở màn xem lại vào toàn màn hình, chụp lại ô đó rồi thoát.
7. Trình duyệt từ chối toàn màn hình: vẫn chụp được ở chế độ thường kèm thông báo.
8. Đứng sao cho camera thấy từ đầu đến qua hông (không thấy cổ chân) vẫn chụp được; hông sát mép dưới khung, mất hông hoặc cắt đầu thì không chụp và hiện đúng thông báo.
8b. Đứng xa để camera thấy cả chân: ảnh lưu gồm cả chân (không cắt ở hông) và có `body_coverage = 'full'`; preview scale từ đỉnh đầu đến bàn chân.
9. Ảnh lưu từ khung có thấy chân đầy đủ có `body_coverage = 'full'`, còn lại là `'hips'`; cả hai đều có `head_to_hip_px` > 0; ảnh cũ là `full` với `head_to_hip_px = NULL`.
10. Không còn chữ "calibrate", "calibration", "hiệu chỉnh" hay "profile" trong giao diện người dùng và panel admin (ngoại trừ đường dẫn/định danh nội bộ).
11. Khối 3 bước hiện ở màn chính và màn xem lại, ẩn khi đang chụp.
12. Camera tự tắt sau khi lưu, sau khi thoát không lưu và khi rời trang; không còn track nào hoạt động (kiểm tra bằng đèn camera và `MediaStreamTrack.readyState`).
13. Preview: phần cơ thể thấy được (đỉnh đầu đến điểm thấp nhất) cao đúng bằng chiều cao khung trắng; tay dang ngang hay giơ cao không làm người nhỏ đi hay bị cắt ở mép phải/trên của stage; phần dư bên trái đè lên khung trắng; ở nhiều kích thước cửa sổ và trong toàn màn hình.
14. `npm run build`, `npm run lint`, `npm run test:calibration` (đã cập nhật), `npm run db:verify` đều đạt; test hình học mới phủ quy tắc hông, bỏ `clipped-bottom`, công thức đỉnh đầu mới và phân loại `body_coverage`.

## 13. Kết quả triển khai (12/11/2026)

### 13.1 Nguyên nhân gốc của lỗi "chỉ có chữ"

Tái hiện trong Chromium (Playwright, WebGL/ANGLE) với ảnh người thật từ kho mẫu của MediaPipe, dùng đúng model và WASM từ CDN như trang:

| Delegate | Landmark | Mask phân đoạn |
| --- | --- | --- |
| **GPU** | đúng (nhận ra người, visibility ≈ 1) | **toàn số 0** (cả `getAsFloat32Array()` lẫn `getAsUint8Array()`), kèm cảnh báo `GL_INVALID_OPERATION: glReadPixelsRobustANGLE: Invalid format and type combination` |
| **CPU** | đúng | đúng: giá trị lớn nhất 1.0, khoảng 23 000 điểm ảnh trên ngưỡng 0.5, khoảng 55–160 ms mỗi khung ở 720×480 |

Với mask toàn 0, `maskBounds` trả `null`, nên không có ảnh xoá nền và nhãn trạng thái là "Không thấy người trong khung hình" dù người đang đứng trong khung: khớp với triệu chứng người dùng báo. Đây là lỗi đọc mask của GPU delegate, không phải do mã của trang. Chưa xác định được liệu máy Mac của bạn có gặp đúng lỗi này không, nhưng cách sửa dưới đây xử lý cả hai trường hợp.

**Cách sửa:**
- Hook `usePoseCutout` phát hiện "có người (pose tin cậy) nhưng mask rỗng" liên tiếp 4 khung ở GPU delegate, rồi tự **tải lại model bằng CPU delegate** và ghi nhớ lựa chọn trong `sessionStorage` (khoá `recordweb-calibration-cpu-delegate`) để các lần sau dùng CPU ngay.
- Preview dùng khung vào 360 px khi chạy CPU (480 px ở GPU) để giữ nhịp khoảng 15 lần/giây.
- Webcam gốc lật gương luôn hiện trong lúc model chưa sẵn sàng hoặc chưa có ảnh xoá nền (mục 3.2), nên người dùng không còn thấy vùng xanh trống.
- Nếu ngay cả CPU vẫn cho mask rỗng khi đã thấy người (kiểm tra 32 khung liên tiếp), hiện lỗi "Model nhận ra bạn nhưng không tạo được ảnh đã xoá nền".

### 13.2 Đã triển khai

- Camera tách khỏi phiên: nút **Bật camera / Tắt camera** ở màn chính; model tải khi camera bật; camera tự tắt sau khi lưu, sau "Thoát không lưu" và khi rời trang.
- Một nút **Bắt đầu chụp** (đã có dữ liệu thì **Thiết lập lại toàn bộ**) vào toàn màn hình trong cùng thao tác bấm; thoát khi xem lại; Esc huỷ lượt và giữ ảnh đã chụp; từ chối fullscreen vẫn chụp được kèm thông báo. Chụp lại một ô từ màn xem lại cũng vào toàn màn hình. Bấm ô ở màn chính chỉ chọn ô, rồi bấm **Chụp lại ô r,c**.
- Quy tắc "tối thiểu đến qua hông" (`evaluateBodyInFrame`), không cắt ở hông, `body_coverage` và `head_to_hip_px`; scale preview theo phần nhìn thấy (đỉnh đầu ước lượng đến điểm thấp nhất của mask).
- Migration `0011_calibration_body_coverage.sql` đã áp dụng; `db:verify` kiểm tra thêm hai cột. API, kiểu dữ liệu và `metadata.json` của ZIP admin có hai trường mới; tab cũ thiếu trường mới nhận lỗi "Hãy tải lại trang rồi thử lại."
- Khối giải thích 3 bước, bảng đổi chữ ở mục 5 (giao diện người dùng, thông báo lỗi phía server và panel admin).

### 13.3 Khác với bản đặc tả

- Huỷ lượt chụp khi **chưa chụp được ô nào** thì về màn chính và **giữ camera bật** để thử lại; chỉ khi đã có ảnh thì mới sang màn xem lại. Camera tắt khi người dùng kết thúc phiên (lưu hoặc thoát).
- Thanh điều khiển và các thông báo lỗi nằm trong khung bao toàn màn hình cùng stage, nên hiện cả trong chế độ toàn màn hình.
- Ngoài `sessionStorage` cho lựa chọn CPU, không có thay đổi về lưu trữ phía trình duyệt.

### 13.4 Đã kiểm tra

- `npm run build`, `npm run lint` (chỉ còn hai cảnh báo cũ của `StudioShell.tsx`), `npm run test:calibration` (12 test), `test:admin-library`, `test:authorization`, `npm run db:verify`.
- SQL trên Neon trong giao dịch rollback: hàng cũ mặc định `full` / `NULL`, upsert ghi `hips` và `head_to_hip_px`, giá trị `body_coverage` sai bị từ chối.
- Quy tắc hông chạy qua MediaPipe thật (CPU) trên ảnh người thật, gồm khung 640×360 và khung gốc 1920×1080 trong cùng một phiên VIDEO: toàn thân → `full` (cao ảnh lưu 1080); cắt dưới hông → chấp nhận, `hips`, `head_to_hip_px` ≈ 417; cắt sát hông hoặc trên hông → chặn `hips-hidden`.

### 13.5 Chưa kiểm tra (cần chạy thủ công với camera thật và phiên đăng nhập)

- Toàn bộ giao diện sau khi đăng nhập: bố cục stage ở nhiều kích thước cửa sổ và trong toàn màn hình, nút **Bật camera**, khối 3 bước, chọn ô, luồng huỷ/Esc, `fullscreenchange`.
- Việc tự chuyển sang CPU trên GPU thật của bạn, và hiệu năng khoảng 15 khung/giây ở CPU.
- Upload Blob thật và lưu `body_coverage` / `head_to_hip_px` qua API (chỉ đã kiểm tra bằng SQL).
- Hằng số khởi đầu: `MIN_HEAD_HIP_RATIO` 0.15, `HIP_BOTTOM_MARGIN` 0.03, hệ số đỉnh đầu 0.157.

### 13.6 Chỉnh sửa sau khi dùng thử (hai lần)

1. **Mất phần bên phải của người.** Nguyên nhân: cutout scale theo chiều cao nhưng căn theo trục thân, nên khi dang tay phần vượt mép phải stage bị cắt.
2. **Người quá nhỏ.** Bản sửa đầu tiên (cả người vừa trong vùng xanh, giới hạn theo chiều rộng) khiến người thấy đến ngực chỉ cao khoảng 40% slide. Người dùng yêu cầu chiều dọc capture phải phủ hết chiều dọc slide.

Quy tắc hiện hành ở mục 7.1 (hàm `placeBody` trong `src/lib/calibration/geometry.ts`): scale theo chiều cao phần nhìn thấy = chiều cao khung trắng, **dịch ngang** thay vì thu nhỏ để không phần nào rời stage. Test `calibration.test.mjs` kiểm tra: chiều cao bằng slide, dịch trái khi dang rộng (không thu nhỏ), tay giơ cao vẫn nằm trong stage, và giới hạn cực đoan. Ảnh lưu vào DB không đổi.

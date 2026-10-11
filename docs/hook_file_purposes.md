
## Custom Hooks - Client-side logic

1. `useMediaDevices.ts` 

chịu trách nhiệm:
- Xin quyền screen sharing.
- Xin quyền camera/microphone.
- Enumerate thiết bị.
- Quản lý MediaStream.
- Dừng track khi thay thiết bị hoặc unmount.

Dữ liệu đầu ra:
```text
screenStream
cameraStream
microphoneStream
systemAudioStream
```

2. `useVisionSegmentation`

nhận cameraStream, chạy MediaPipe trong browser và trả về:

```
cameraStream
    ↓
MediaPipe segmentation
    ↓
effectCanvas
```
effectCanvas chứa camera đã blur hoặc remove background.

3. `useCanvasCompositor` 

nhận:
- screenStream
- cameraStream
- effectCanvas
- PiP position, size, shape
- Resolution

Sau đó vẽ tất cả lên một canvas 30 FPS và tạo:
canvas.captureStream(30)
Kết quả là một compositeStream duy nhất.


4. `useAudioDSP` 

nhận microphone và system audio rồi tạo Web Audio graph:

```
Microphone
 → High-pass
 → Presence EQ
 → Low-pass
 → Compressor
 → Noise gate
 → Gain
 ┐
 ├→ MediaStreamAudioDestination
 ┘
System audio
 → Gain
```

Kết quả là mixedAudioStream.


5. `useRecordingSession`

nhận: compositeStream + mixedAudioStream
Sau đó:
1. Ghép video track và audio track.
2. Tạo MediaRecorder.
3. Ghi chunk mỗi giây.
4. Lưu draft vào IndexedDB.
5. Quản lý pause/resume và giới hạn 30 phút.
6. Khi stop, ghép chunks thành Blob.
7. Sửa WebM duration.
8. Lưu recording hoàn chỉnh vào IndexedDB.
9. Trả Blob và preview URL cho UI.
Toàn bộ quá trình này không gửi video lên backend.




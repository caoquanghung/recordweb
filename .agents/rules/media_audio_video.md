# Media, Audio & Video Invariants

## 1. Video Compositing & 30 FPS Rules
- **Framerate Guarantee**: Frame rendering must be throttled to 30 FPS (`~33.33ms` interval) using `requestAnimationFrame` with delta timing.
- **Canvas Resolution**: Base recording canvas must be fixed at `1920x1080` (or matching source 16:9 ratio). Non-16:9 screen shares must be fitted with letterboxing/pillarboxing.
- **Picture-in-Picture Rendering**:
  - Webcam overlay coordinates and dimensions must be kept within canvas bounds.
  - In transparent cutout mode, use `globalCompositeOperation = 'source-in'` with the MediaPipe segmentation mask.

## 2. Web Audio DSP Invariants
- **Order of Audio Nodes**:
  1. Input Source (`MediaStreamAudioSourceNode`)
  2. High-Pass Filter (80Hz, Q=0.707)
  3. Vocal Peaking Filter (2.8kHz, +4dB, Q=1.2)
  4. Low-Pass Filter (12kHz, Q=0.707)
  5. Dynamics Compressor Node (Threshold: -24dB, Ratio: 4)
  6. Noise Gate Gain Node
  7. Master Audio Destination & AnalyserNode
- **System Audio**: When user shares tab/screen audio, mix it directly into the master destination via a separate gain node so mic filtering does not distort system sounds.

## 3. MediaRecorder & WebM EBML Invariants
- Always pass `{ mimeType: 'video/webm; codecs=vp9,opus' }` (with fallback to `'video/webm'` or `'video/mp4'` for Safari).
- Always set a chunk timeslice (e.g. `mediaRecorder.start(1000)`) so data is collected periodically instead of one monolithic chunk at the end.
- When `mediaRecorder.pause()` is called, immediately stop active duration accumulation. On resume, restore time tracking.
- Do NOT directly offer raw WebM for download without running the EBML duration patcher, as unpatched WebM files lack seekable index headers.

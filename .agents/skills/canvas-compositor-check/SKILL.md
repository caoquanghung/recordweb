---
name: canvas-compositor-check
description: >-
  Use this skill to validate the 30 FPS canvas rendering loop, PiP positioning coordinates, and MediaPipe AI segmentation masking.
---

# Canvas Compositor & Vision Check

This skill provides verification procedures for the multi-stream video canvas composition and AI segmentation pipeline.

## Verification Checklist

### 1. 30 FPS Frame Throttling
* Inspect the render loop to verify that delta time tracking (`currentTime - lastFrameTime >= 33.33ms`) is used instead of unbounded rendering.
* Verify that `canvas.captureStream(30)` specifies `30` as the framerate parameter.
* Check that rendering is skipped or suspended when the recording is paused or no streams are active.

### 2. Picture-in-Picture Layout & Bounds
* Verify that PiP overlay coordinates clamp within canvas dimensions `[0, 1920 - pipWidth]` and `[0, 1080 - pipHeight]`.
* Ensure clipping paths (Circle, Rounded Rect) restore canvas state using `ctx.save()` and `ctx.restore()`.
* Test dragging and anchor switching (Top-Left, Top-Right, Bottom-Left, Bottom-Right).

### 3. AI Background Segmentation Mask
* Ensure the input video frame fed to MediaPipe is properly loaded (`readyState >= 2`).
* Validate that segmentation mask drawing uses `globalCompositeOperation = 'source-in'` for transparent cutout.
* Ensure fallback behavior if MediaPipe model fails to load (revert to circular webcam preview with warning message).



### Critical Technical Risks & Blind Spots

While the architecture is solid, video and browser engineering come with tricky runtime pitfalls that this document should address:

#### Risk 1: The Safari / Apple Playback Problem (WebM vs. MP4)
* **The Problem:** Chrome and Firefox record natively to `video/webm` (VP8/VP9 + Opus). However, **Apple Safari (macOS and especially iOS) has notoriously poor or inconsistent support for WebM containers and Opus audio.**
* **Impact:** If your user records a video and shares the Vercel Blob public link with a teammate using an iPhone or Safari, the video may fail to play or will play without sound.
* **Solutions:**
  1. **Codec Detection:** Check if the browser supports `video/mp4;codecs=avc1` via `MediaRecorder.isTypeSupported('video/mp4')` (Chromium now supports MP4 encoding natively in recent versions).
  2. **Client-Side Transcoding (Heavy):** Use `@ffmpeg/ffmpeg` (WebAssembly) to remux WebM to MP4 in-browser (can be slow on mobile/laptops).
  3. **Cloud Transcoding / Service:** If cross-device public sharing is a key feature, consider using a video delivery service (like Cloudflare Stream or Mux) or an asynchronous background transcode worker.

#### Risk 2: Main Thread Overload & Dropped Frames
* **The Problem:** Running:
  1. 1080p @ 30 FPS Canvas redraw (`drawImage`),
  2. MediaPipe neural segmentation inference,
  3. Web Audio nodes,
  4. React UI re-renders, and
  5. `MediaRecorder` video encoding
  all on the **single JavaScript main thread** will cause dropped frames, laggy UI, and thermal throttling on mid-tier laptops (e.g., non-M-series MacBooks or thin Windows laptops).
* **Mitigation:**
  * The document smartly uses a downscaled canvas (256x256) for MediaPipe inference—ensure this runs on a WebGL/WASM context.
  * If the canvas compositing causes stutter, move the canvas render loop to an **`OffscreenCanvas` inside a dedicated Web Worker**, freeing the React UI thread completely.

#### Risk 3: Audio/Video Desync over Long Recordings
* **The Problem:** When mixing a video stream derived from `canvas.captureStream(30)` with an audio stream from `AudioContext.createMediaStreamDestination()`, the browser tracks two independent clocks. Over 10–15+ minute recordings, the audio and video often drift out of sync by several hundred milliseconds.
* **Mitigation:**
  * Add a max duration limit (the document mentions `5:00 Reached`, which is a very safe threshold to prevent drift).
  * If allowing longer recordings, ensure `canvas.captureStream(30)` is triggered by a steady timestamp timer rather than an erratic `requestAnimationFrame` that throttles when the user switches tabs.

#### Risk 4: Noise Gate Audio Popping / Clicking
* **The Problem:** A naive Noise Gate using a `GainNode` that sharply sets `gain.value = 0` when audio falls below a threshold will cause audible **clicking/popping** artifacts in the user's speech.
* **Mitigation:**
  * Implement smooth attack and release envelopes using `gainNode.gain.setTargetAtTime(target, currentTime, timeConstant)` (e.g., 10ms attack, 100ms release) to ensure smooth transitions between open and closed gate states.

#### Risk 5: Missing Authentication & Access Control
* **The Problem:** The database schema (`recordings` table) currently lacks a `user_id` foreign key.
* **Impact:** 
  * Anyone visiting `/api/recordings` can see or delete anyone else's recordings.
  * Anonymous users can spam `/api/upload`, depleting your Vercel Blob storage quota and running up your bill.
* **Mitigation:** Add an authentication provider (e.g., **Clerk**, **NextAuth/Auth.js**, or **Supabase Auth**) and enforce user-specific database queries and upload rate limits.

---

### 3. Cost & Scaling Considerations (Vercel Blob vs. Alternatives)

* **Vercel Blob** is great for fast prototyping because of `@vercel/blob/client`.
* However, **Vercel charges for bandwidth / data transfer out ($0.15/GB on Pro)**. If your website gets popular and many users stream long recordings from your public links, bandwidth costs can scale quickly.
* **Future Upgrade Path:** If bandwidth costs become a concern, swap `@vercel/blob/client` with **Cloudflare R2** via S3 presigned URLs. Cloudflare R2 has **$0 egress fees**, meaning streaming millions of video views costs nothing in bandwidth.

---

### 4. Recommended Modifications to Schema & Project Structure

#### Database Schema Update (Include User & Deletion Security)
Update `src/lib/db.ts` to include ownership and soft-deletion:

```sql
CREATE TABLE recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL,    -- Links to Clerk / Auth.js User ID
    title VARCHAR(255) NOT NULL,
    duration_seconds REAL NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    resolution VARCHAR(32) NOT NULL DEFAULT '1920x1080',
    fps INTEGER NOT NULL DEFAULT 30,
    mime_type VARCHAR(64) NOT NULL DEFAULT 'video/webm',
    storage_url TEXT NOT NULL,         -- Vercel Blob URL
    blob_pathname TEXT NOT NULL,       -- Required to delete blob via del(pathname)
    is_public BOOLEAN DEFAULT FALSE,   -- Share link toggle
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_recordings_user_id ON recordings(user_id);
```

---

### Final Assessment: Ready to Build?

**Score: 9.5 / 10**

This document provides a cohesive architectural foundation. You have solved the hardest parts on paper (compositing, audio graph, direct blob upload, and metadata repair).

**Immediate Next Steps to Begin:**
1. **Milestone 1:** Build `useMediaDevices` + `useRecordingSession` and test local recording and downloading in Chrome.
2. **Milestone 2:** Implement `ebmlPatcher.ts` and verify that downloaded files can be scrubbed back and forth smoothly in VLC or Chrome.
3. **Milestone 3:** Add `useAudioDSP` and test with microphone input.
4. **Milestone 4:** Connect `@vercel/blob/client` and Neon Postgres for cloud uploads.
# RecordWeb Product Recommendations

## 1. Product Concept

Position RecordWeb as a **privacy-first browser recording studio**: fast and approachable like Loom, with lightweight OBS-style controls and no software installation.

**Suggested value proposition:**

> Record, polish, and share from your browser.

The primary workflow should remain simple:

1. Choose what to capture: screen, webcam, microphone, and system audio.
2. Select or customize a studio preset.
3. Record continuously until the user stops the session.
4. Preview and optionally trim the result.
5. Save locally or upload and share.

## 2. Recommended Website Structure

### 2.1 Dashboard

After login, users should see:

- A prominent **New recording** button.
- Recent recordings.
- Saved studio presets.
- Recording status: local-only, uploading, or shared.
- Storage usage and recording duration.
- Quick actions to download, rename, share, or delete a recording.

### 2.2 Recording Setup

Before recording, provide a compact configuration screen with:

- Screen source selector.
- Camera selector and live preview.
- Microphone selector with a VU meter.
- System-audio toggle.
- Resolution options such as 720p and 1080p.
- Webcam layouts: circle, rounded rectangle, or hidden.
- Background modes: normal, blurred, or removed.
- Audio filters with a live microphone test.
- Studio preset selector.

The application should perform a browser compatibility check before the recording starts.

### 2.3 Recording Studio

Use a premium dark interface with the recording canvas at the center. A floating control dock could contain:

- Continuous recording and stop controls.
- Elapsed time and the 30-minute limit.
- Microphone mute control.
- Camera toggle.
- Screen-sharing status.
- Timeline marker button.
- Stop recording button.
- Current FPS and audio status.

Allow users to drag and resize the webcam overlay directly on the preview. Show a persistent privacy indicator such as:

> Recording locally — nothing has been uploaded yet.

### 2.4 Review Screen

After recording, the review screen should:

- Display the final composited video.
- Allow the title to be edited.
- Provide basic start and end trimming.
- Display duration, file size, resolution, and format.
- Offer actions to download locally, save in the browser, upload to the cloud, or record again.
- Show recovery status so the user knows whether the recording is safely cached in IndexedDB.

### 2.5 Recording Library

Each recording card should show:

- Thumbnail.
- Title and owner.
- Duration and creation date.
- Local or cloud storage status.
- Visibility setting.
- Download, share, rename, and delete actions.

Useful filters include **Mine**, **Shared with me**, **Local only**, and **Cloud**.

### 2.6 Sharing Page

The sharing experience should include:

- An embedded video player.
- Recording title and owner.
- Playback speed controls.
- Download permissions.
- Public or restricted access.
- Optional link expiration.

When sharing with registered users, support roles such as:

- Viewer.
- Viewer with download permission.
- Editor or manager.

## 3. Feature Recommendations

### 3.1 Recording Presets

Presets should remember:

- Selected camera and microphone.
- Webcam shape, size, and position.
- Recording resolution.
- Background effect.
- Audio filters.
- System-audio preference.

Suggested built-in presets:

- Presentation.
- Coding tutorial.
- Webcam message.
- Product demonstration.
- Online lecture.

### 3.2 Audio Enhancement Modes

Provide understandable modes before exposing technical controls:

- Natural.
- Voice clarity.
- Noise reduction.
- Podcast.
- Custom.

Advanced users can expand a panel with gain, high-pass filter, compressor, and noise-gate controls.

### 3.3 Continuous Recording

Do not expose pause or resume controls after recording starts. Keeping each session continuous avoids timestamp gaps and broken-frame risks in post-recording processing.

### 3.4 Recording Recovery

Recording recovery can be a major product differentiator:

- Periodically store recording chunks in IndexedDB.
- Detect unfinished sessions after a crash or page reload.
- Offer a **Recover recording** action.
- Repair the WebM duration before playback or download.

### 3.5 Presentation Tools

Useful additions include:

- Cursor highlighting.
- Click animations.
- A countdown before recording.
- Keyboard shortcuts.
- A reminder to hide desktop notifications.
- On-screen annotation or spotlight tools.
- Timeline markers added during recording.

## 4. Recommended MVP Scope

Prioritize the initial release in this order:

1. Login and registration.
2. Screen, webcam, microphone, and system-audio capture.
3. 1080p canvas composition at 30 FPS.
4. Webcam positioning and resizing.
5. Stop recording.
6. A 30-minute automatic recording limit.
7. Local recovery and WebM download.
8. Basic audio enhancement.
9. Normal, blurred, and removed camera backgrounds.
10. Saved studio presets.
11. Cloud upload and shareable links.

Basic trimming, annotations, collaboration comments, and viewing analytics can follow in later releases.

## 5. Product Identity

The strongest identity for RecordWeb is:

> A polished recording studio that keeps processing private and local until the user explicitly chooses to upload.

This positioning connects the application's browser-based architecture with a clear benefit that users can immediately understand.

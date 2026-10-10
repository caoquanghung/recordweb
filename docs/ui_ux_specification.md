# UI / UX Specification & Design System

## 1. Design Aesthetics & Visual Philosophy

RecordWeb is designed as a **modern, high-performance web broadcast studio** (reminiscent of professional tools like Loom, OBS Studio, and Linear). It employs a dark glassmorphic design language, precision typography, vibrant micro-animations, and instant visual feedback.

### 1.1 Color Tokens & Theme Variables

```css
:root {
  /* Surfaces & Backgrounds */
  --bg-primary: #0a0d14;
  --bg-secondary: #121824;
  --bg-elevated: #1a2233;
  --bg-glass: rgba(18, 24, 36, 0.75);
  
  /* Borders & Dividers */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-active: rgba(99, 102, 241, 0.5);
  --border-glow: 0 0 16px rgba(99, 102, 241, 0.25);
  
  /* Accents & Brand Gradients */
  --accent-primary: #6366f1;       /* Indigo */
  --accent-secondary: #06b6d4;     /* Cyan */
  --accent-gradient: linear-gradient(135deg, #6366f1 0%, #06b6d4 100%);
  
  /* Status Colors */
  --recording-red: #ef4444;        /* Crimson pulse */
  --recording-glow: 0 0 18px rgba(239, 68, 68, 0.5);
  --warning-amber: #f59e0b;
  --success-emerald: #10b981;
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  
  /* Radii & Shadows */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-full: 9999px;
  --shadow-xl: 0 20px 40px -15px rgba(0, 0, 0, 0.6);
  --backdrop-blur: blur(16px);
}
```

### 1.2 Typography
* **Font Family**: Modern sans-serif stack (`Inter`, `system-ui`, `-apple-system`, `sans-serif`).
* **Monospace**: `JetBrains Mono`, `SFMono-Regular`, `Consolas` for timer numbers to prevent layout jittering during countdowns.

---

## 2. Interface Layouts & Screen Progression

### 2.0 Application Information Architecture

The product is organized around six user-facing areas:

1. **Authentication** — register, sign in, and recover access.
2. **Dashboard** — start a recording, reopen recent work, and load presets.
3. **Recording Setup** — choose sources, test audio, check compatibility, and select a preset.
4. **Studio** — preview the composition and control the active recording.
5. **Review** — inspect, recover, download, or explicitly upload the result.
6. **Library & Share** — manage local/cloud recordings and control audience access.

Cloud unavailability must not block local recording. The interface should distinguish these states consistently:

- **Local only** — stored in IndexedDB or downloaded, never uploaded.
- **Recoverable** — interrupted session data exists locally.
- **Uploading** — transfer is in progress and may be cancelled or retried.
- **Private cloud** — uploaded but accessible only to the owner and explicit recipients.
- **Public link** — anonymous link access is enabled.

### 2.0.1 Dashboard

The dashboard is the default authenticated landing page and contains:

- Primary **New Recording** action.
- Quick-start cards for Presentation, Coding Tutorial, Webcam Message, Product Demo, and Online Lecture.
- Recent-recording list with duration, creation time, owner, and storage status.
- Saved presets with Load, Rename, and Delete actions.
- Recovery banner when an unfinished local session is detected.
- Cloud-connection warning that never prevents local recording.

### 2.0.2 Recording Setup & Preflight

Before the studio starts, show one compact readiness flow:

- Capture mode: Screen Only, Webcam Only, or Screen + Webcam.
- Screen-source request with a reminder to enable Share Audio when needed.
- Camera and microphone selectors with live preview and VU meter.
- System-audio availability state; do not display it as enabled if no track was granted.
- 720p or 1080p output, always composed to 16:9.
- Background mode, webcam frame, and audio enhancement preset.
- Browser capability results for MediaRecorder MIME type, screen capture, system audio, and File System Access fallback.
- Clear Start Recording button and links to save or update the selected preset.

```
+--------------------------------------------------------------------------+
|  RecordWeb Studio   [Mode: Screen + PiP]          [Audio: Active] [⚙]   |
+--------------------------------------------------------------------------+
|                                                                          |
|   +------------------------------------------------------------------+   |
|   |                                                                  |   |
|   |                     LIVE CANVAS PREVIEW                          |   |
|   |                       (1920x1080 Viewport)                       |   |
|   |                                                                  |   |
|   |                                              +----------------+  |   |
|   |                                              | Webcam PiP     |  |   |
|   |                                              | [AI Cutout]    |  |   |
|   |                                              +----------------+  |   |
|   +------------------------------------------------------------------+   |
|                                                                          |
+--------------------------------------------------------------------------+
|  [● REC 12:45 / 30:00]   [ ⏸ Pause ]   [ ⏹ Finish ]   [ 🎤 -18dB VU ]   |
+--------------------------------------------------------------------------+
|  Filters: [x] 80Hz Rumble  [x] Vocal Boost  [x] Noise Gate  | BG: Cutout |
+--------------------------------------------------------------------------+
```

### 2.1 View 1: Studio Setup (Pre-Recording)
* **Central Stage**: Responsive 16:9 monitor view showing current composite composition.
* **Source Mode Selector**:
  * 🖥️ **Screen Only**: Quick capture for software demos.
  * 📷 **Webcam Only**: Talking head vlogs and presentations.
  * 🌟 **Studio Mode (Screen + Webcam PiP)**: Interactive overlay with draggable webcam avatar.
* **Control Panels (Docked or Collapsible)**:
  1. **Camera & AI Background Drawer**:
     * Background Mode: `Original` | `Blur (Low/Medium/High)` | `Transparent Cutout (AI)` | `Virtual Wallpaper`.
     * PiP Frame: `Circle` | `Rounded Square` | `Raw Aspect Ratio`.
     * PiP Size: `Small (160px)` | `Medium (240px)` | `Large (320px)`.
     * PiP Position presets: 4 corners + free drag.
  2. **Audio & Sound Filter Deck**:
     * Microphone device selector.
     * Real-time VU meter with dynamic green-to-amber-to-red level indicator.
     * Sound Filter Toggles:
       * 🛡️ **Rumble Reducer (80Hz High-Pass)**
       * 🎙️ **Vocal Clarity (Peaking 2.8kHz)**
       * 🔇 **Hiss Suppressor (12kHz Low-Pass)**
       * 🚪 **Noise Gate (Silence Floor)**
       * 🎛️ **Mic Gain Slider (0% - 200%)**
* **Primary Call to Action**: Glowing gradient button: **"Start Recording (30 FPS)"**.

### 2.2 View 2: Pre-Roll Countdown
* Overlay appears over preview with backdrop blur.
* Circular animated countdown timer `3 → 2 → 1`.
* Gives user 3 seconds to switch focus to their target presentation window.

### 2.3 View 3: Live Active Recording
* **Header / Floating Dock**:
  * Glowing pulsating red pill: `● REC`.
  * **Precision Timer**: `12:35 / 30:00`, based on active recording time rather than wall-clock time.
  * **Warning States**: Show a non-blocking long-session advisory at `15:00`; at `29:00`, turn the timer amber and announce *"60 seconds remaining before automatic finalization"*.
  * **Controls**:
    * **Pause / Resume** toggle button (`⏸ Pause` / `▶ Resume`).
    * **Stop Recording** button (`⏹ Finish`).
    * **Microphone Mute** quick switch.
    * **Camera Flip / Hide** toggle.

### 2.4 View 4: Review, Preview & Export Modal
* Instant playback window with HTML5 video player and seekable timeline.
* Metadata card:
  * Duration (e.g. `03:42`).
  * FPS (e.g. `30.0 FPS`).
  * Resolution (e.g. `1920x1080`).
  * File Size (e.g. `24.6 MB`).
* Actions:
  * 💾 **Download Video (.webm)**: Direct local save with fixed EBML seek headers.
  * ☁️ **Upload & Share Link (Vercel Blob)**:
    * One-click cloud upload with real-time progress bar.
    * Generates a permanent, shareable HTTPS link directly to Vercel Edge Blob storage.
    * Single-click "Copy Link" button with success toast notification.
  * 🔄 **Record Another**: Discard or return to studio without page refresh.
* **Recording Library Drawer**:
  * Dual-tab shelf showing both **Local IndexedDB Recordings** (offline cache) and **Cloud Uploaded Videos** (synced from Neon Postgres with public playback links).

The review UI must make upload an explicit action. Do not imply that a locally processed recording has already left the device. Show recovery status and upload status independently.

### 2.5 View 5: Recording Library

The full library provides four filters:

- **Mine** — all recordings owned by the authenticated user.
- **Shared with Me** — recordings granted directly by another user.
- **Local Only** — IndexedDB entries that have not been uploaded.
- **Cloud** — recordings with Blob storage metadata.

Each item includes thumbnail or format placeholder, title, duration, date, storage state, visibility, and owner. Contextual actions include Preview, Rename, Download, Share, and Delete. Destructive actions require confirmation and must explain whether the local copy, cloud copy, or both will be removed.

### 2.6 View 6: Sharing Controls & Public Player

Owner sharing controls include:

- Private-by-default visibility.
- Public-link toggle with Copy Link action.
- Recipient search by registered email or account identity.
- `Viewer` and `Viewer + Download` permissions for the MVP.
- Revoke action for every recipient.

The public/share player includes title, owner, duration, playback speed, fullscreen, and conditional download. Private or revoked links show a neutral access-denied state without leaking recording metadata.

### 2.7 Responsive Laptop Layout

- Optimize the primary studio for viewport widths from 1024px upward.
- Collapse secondary settings into drawers before reducing the preview below a usable 16:9 size.
- Keep Record/Pause/Stop controls visible without scrolling.
- Use browser zoom-safe sizing and avoid controls that depend exclusively on hover.

---

## 3. Keyboard Shortcuts & Accessibility

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| `Space` / `Alt+P` | Pause / Resume recording | Active Recording |
| `Alt+S` | Stop and Finish recording | Active Recording |
| `Alt+M` | Mute / Unmute microphone | Anywhere |
| `Alt+C` | Toggle Webcam visibility in PiP | Studio Mode |
| `Escape` | Cancel / Dismiss modal | Modals |

All shortcuts must be disabled while focus is inside an editable field and must have visible button equivalents. Recording status changes should be announced through an `aria-live="polite"` region; the final-minute warning should use an assertive announcement without repeating every timer tick.

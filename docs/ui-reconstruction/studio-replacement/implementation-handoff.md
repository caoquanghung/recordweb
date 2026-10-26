---
spec_version: 1
status: ready-for-implementation
screen: Standard Studio setup and recording
figma_file: https://www.figma.com/design/H8NiBxcFq1hEz3bFPtnhFS/RecordWeb-%E2%80%94-Studio---Preview?node-id=18-539
figma_nodes: ["18:539", "18:724", "18:810"]
captured_at: 2026-10-26
repository_commit: 11a41590b5c327369adb6cca89f5a9a735eb2535
target_routes: [/studio]
reference_viewports: ["1024x960"]
---

# Studio replacement handoff

## Scope and evidence

User requirement: replace the Standard Studio body with a smaller preview on the left and visible connection actions in a right inspector. Device connection precedes verified Google Slides capture, which precedes recording. Original camera is the only selectable background mode; keep segmentation source code. Green **Ready** appears only after all required sources are verified. Post-recording review stays in Studio.

Verified Figma: node `18:539` is 1024 × 960 with a 704 px central stage and 320 px right inspector. The inspector has a 57 px header, light cards and blue/white connection buttons. A floating production dock sits below the preview. The artwork also includes annotation, teleprompter, cloud sync, ProRes RAW, and 60 FPS labels; these have no verified RecordWeb handler and are out of scope. The screenshot's mock dashboard and camera photo are example content, not a recording source or implementation asset.

Verified repository: `StudioShell` mounts `useStudioController` once per active workspace. `StudioStage` owns the canvas ref and start/pause/resume/stop UI; `StudioSourcesPanel` calls existing device and Slides actions. `useStudioController` derives `requiredDevicesConnected`, owns `tabCapture.connected`, the current screen stream, the countdown, and review state. `StudioReviewWorkspace` retains finalized Blob, title, upload and download interactions in the mounted controller. Presentation workspace has a separate capture root and is out of this layout change.

## Requirements and disposition

| ID | Requirement | Disposition | Owner | Acceptance |
| --- | --- | --- | --- | --- |
| STUDIO-01 | Preview and actions share the first viewport at desktop width; right rail is about 320 px at the Figma reference size. | Restyle/compose | `StudioShell`, `StudioSourcesPanel`, Studio CSS | At 1024 × 960, both connection actions and record control are visible without page scrolling; narrow screens stack without clipped controls. |
| STUDIO-02 | Device → Slides → Record sequence. | UI state plumbing | `StudioSourcesPanel`, `StudioStage` | Slides button is disabled before required devices are ready; Record is disabled until devices, screen track and verified `tabCapture.connected` are present. Existing controller guards remain active. |
| STUDIO-03 | Green Ready reflects actual verified sources. | Presentation state | `StudioSourcesPanel`, `StudioChrome` | It is absent before full readiness, appears after verification, and disappears if a source disconnects. |
| STUDIO-04 | Original camera is default; no blur/cutout choice. | Narrow product behavior change explicitly requested | `useStudioController`, `StudioEffectsPanel` | Default and applied quick start/preset use `original`; blur/cutout controls are not offered; MediaPipe implementation remains in the repository. |
| STUDIO-05 | Preserve recording and review lifecycle. | Reuse as is | `StudioStage`, `StudioShell` | Canvas ref/pointer handlers, countdown, controls, recovery, review, permission checks and media ownership still work. |

## Integration constraints

Use Vanilla CSS Modules and existing app tokens. The Figma screenshot is a visual target, not a live source or downloadable runtime placeholder. The actual `canvas` stays 16:9 and is shown whenever visual sources are connected. In the idle state, use the existing instructional mock. Keep the right inspector controls bound to `connectSources` and `connectSlideSource`; retain the latter's direct user-gesture picker call. Keep the Start button bound to `startUiTest` and never imply that disabling the button replaces its controller guard. A ready badge must require `requiredDevicesConnected`, a live screen video track, and `tabCapture.connected`.

The existing advanced screen-only and webcam-only capture modes remain available. Screen-only requires a microphone before Slides; webcam-only does not use a Slides source. The three-step flow and Figma layout describe the default screen-plus-camera mode.

Allowed presentation files: `StudioShell.tsx`, `StudioSourcesPanel.tsx`, `StudioStage.tsx`, `StudioEffectsPanel.tsx`, `StudioChrome.tsx`, and component CSS Modules. The user explicitly requested narrow Studio controller changes for STUDIO-02/03/04: derived verified readiness, original camera defaults/preset normalization, and keeping the Standard Studio source rail visible after connection. Do not edit media hooks, providers, APIs, auth, database, storage, or extension code. Preserve presentation mode.

## Verification

Run lint and production build. Compare the 1024 × 960 reference and a narrow viewport; check keyboard focus and disabled button states. Exercise devices, verified Slides picker, countdown, pause/resume, stop, review and cleanup in an authenticated Chromium profile when available. For canvas integrity, inspect the compositor ref, 30 FPS contract, and PiP handlers; report static versus browser runtime evidence separately.

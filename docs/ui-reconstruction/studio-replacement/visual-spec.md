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

# Standard Studio visual specification

Source: read-only Figma design context and screenshot for node `18:539`, inspected October 26, 2026. The Figma frame is 1024 × 960 design pixels, not a measured browser CSS viewport. Existing app behavior was checked in `StudioShell`, `StudioStage`, `StudioSourcesPanel`, `StudioEffectsPanel`, and `useStudioController`.

## Structure and geometry

- `STUDIO-01` — At the reference frame, a 704 px main stage sits beside a 320 px inspector. The inspector has a 57 px header, scrollable card body, and 39 px footer. The stage preview is 16:9, with a pale blue frame, rounded corners and soft blue shadow. A production dock sits directly below the preview. The live RecordWeb canvas replaces Figma's static example dashboard and webcam photo; these are not runtime assets.
- `STUDIO-02` — The inspector begins with an uppercase section label and readiness count. Step 1 and Step 2 appear as separate cards with 16 px rounding, 12–16 px gaps, a blue primary device button and a white Slides button. Disabled actions use neutral gray styling and remain visible. Existing device, capture mode, resolution and disconnect controls live in an expandable management section beneath the primary steps.
- `STUDIO-03` — The readiness badge and per-card dot become green only from verified source state. Initial, connecting, ready, error and disconnected states must use existing controller signals. The top badge must not claim Ready when the Slides tab or required devices are missing.
- `STUDIO-04` — Original camera is the default and the only offered background mode. Circle/rounded frame, placement and size controls remain available in Settings; blur and cutout are not offered. Existing MediaPipe implementation remains untouched.
- `STUDIO-05` — The active preview canvas, countdown overlay, 30 FPS target, timer, recording controls, keyboard/PiP handlers, audio meters, warning/recovery notice, diagnostics drawer and post-recording Review remain live components. No static Figma mock control should pretend to annotate, sync notes, use ProRes, or run at 60 FPS.

## Typography, color and assets

Observed Figma palette: page `#f8fafc`, white inspector/cards, blue action `#2563eb`, dark title `#0f172a`, secondary text near `#475569`, green readiness near `#059669`, and neutral borders around `#e2e8f0`. Card radius is about 16 px; inspector width is exactly 320 px in the reference metadata. Figma uses Plus Jakarta Sans/JetBrains Mono; RecordWeb retains its installed font stack to avoid expanding the font-loading contract. Existing `StudioIcon` vectors are used for equivalent source/status symbols. Dynamic device labels, preview video, levels and timer always come from the application; Figma's sample device names, chart, photo and codec labels are example content only.

## Responsive and accessibility

Only the 1024 × 960 Figma frame was supplied. Proposed adaptation: preserve the two-column relationship above 760 CSS px, then stack inspector before stage so connection steps precede Record in reading and keyboard order. Allow inspector body to scroll when its content exceeds viewport height. Keep the actual canvas ratio 16:9, buttons at least 38 px high, visible focus, live status text, and native disabled semantics. The expandable advanced controls use native `<details>` semantics.

## Acceptance

At the reference desktop size, both connection buttons and Record should be reachable without scrolling the page. On narrow viewports there should be no horizontal overflow or clipped record controls. Step 2 and Record must be disabled until their respective prerequisites are met; green Ready must appear only after verified connection. Existing review and recording lifecycle must still work. Authenticated extension/device runtime testing remains required because the static Figma frame does not define browser permissions or capture behavior.

## Follow-up UI decision

The Standard Studio setup/recording workspace now occupies one browser viewport. Its source inspector scrolls internally for advanced controls, while the page and preview controls stay fixed. Two minimal Mic/Tab activity bars live inside the first source card; Presentation keeps the existing larger audio meter. This follows the user's later request and supersedes the earlier meter placement.

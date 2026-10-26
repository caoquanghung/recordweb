# Post-recording review visual specification

Source: RecordWeb Studio Preview Figma frame `22:1520` (1280 × 1123), inspected on 2026-10-26. User requirements: `docs/note-note/post-recording.md`.

## Layout

- Keep the implemented `AppSidebar`; the 256 px Figma sidebar is illustrative only.
- The review content has a compact top row with “Back on Live studio”, a review heading, and the real recording duration/resolution/frame-rate summary.
- Main body uses a wide left column for a 16:9 native video preview and a narrow right column for sharing and downloads. At narrow widths the columns stack.
- Use the existing app theme tokens, rounded panels, subtle borders, and blue primary actions. Do not copy the Figma mock photo or its fabricated data.
- Put the mandatory title control above the action cards, with a visible saving state and validation/error feedback.
- The download card contains a ZIP action and a short, vertically scrollable inventory of the actual available source files.

## Dynamic content and states

- Preview the actual composite recording with native video controls. Show a preparation state until its object URL is ready.
- Show actual duration, resolution, FPS, file count, type and size from `RecordingMetadata`.
- Show automatic save progress and retry on failure without exposing implementation/storage terminology in normal UI.
- Disable title save until the automatic save has completed. A title is required before download, sharing, or returning to the live studio.
- Sharing uses the existing owner publish-and-copy-link action, only after title save.
- `RecordingDeveloperInspection` remains permission-gated and is the sole place for waveforms, source diagnostics, and cursor visualization. No general-user waveform is added.

## Exclusions from mock data

Do not add fake chapters, playback speed, subtitles, recording analytics, 4K/60 FPS, or sample asset sizes. Keep real browser playback controls and actual recording data.

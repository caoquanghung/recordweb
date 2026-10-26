# Post-recording review implementation handoff

Status: implemented (2026-10-26). Figma node `22:1520`; user specification `docs/note-note/post-recording.md`.

## Required changes

1. `StudioReviewWorkspace.tsx` and its CSS Module: build the two-column review layout, top return action, real preview, title gate, share card, ZIP action, and scrollable real asset inventory. Preserve the existing developer inspection component.
2. `useStudioController.ts`: automatically upload finalized or recovered recording assets before title entry using the current direct browser-to-Blob path. Guard duplicate effect invocation; retain progress/error/retry. POST metadata under a deterministic temporary title, then PATCH the owned database row to the entered title before completing local title save. The top return action performs a full navigation to `/studio` after the title is saved.
3. `src/app/api/recordings/route.ts`: allow owner-scoped title PATCH with the existing normalization/120-character validation; preserve the existing `is_public` update. Make the metadata POST idempotent for an existing owner/local ID to support safe retry after a lost response.

## Boundaries and checks

- The user explicitly requests the upload/title backend change. No media capture, compositor, DSP, authentication, schema, or Blob token implementation change is needed.
- Keep the composite as the public preview. Source assets, waveform, and cursor diagnostics stay behind `recording-assets:inspect`.
- Verify lint, Next production build, and relevant route authorization behavior. Review progress, retry, title-save failure, recovered draft, ZIP gating, share link, and full-page return through code and available browser checks.

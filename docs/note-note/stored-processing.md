I think the current implementation do not save for the uploading session (upload video to object storage or the storage process with Neon Database)

1. Report with me about the current approach to handle video backup. what will happen if the user quit the web during the uploading session? How the current backup algorithm handle this.

2. But before going to optimize the backend logic, we can help avoid this scenerio as much as possible by using UX design. I propose to add more "friction experience" in the user quiting process: show a popup to alert them that they shouldn't quit (followed by some reason), but do not force them to stay in. If they confirm to out, let's they out.

---

## Implementation audit — October 29, 2026

> Historical snapshot before the implementation below. The current full-backup, cancellation, and Dashboard recovery behavior is documented in **Implemented recovery flow** at the end of this file.

The application has a local media recovery mechanism, but no durable upload-session recovery. An IndexedDB recording draft is not a resumable Blob upload or a pending Neon transaction.

### Current save order

1. **Recording:** Each media recorder produces chunks with a requested one-second timeslice. Every nonempty chunk schedules an IndexedDB checkpoint containing all accumulated media chunks and basic session metadata. Writes are serialized. The timeslice is not a guarantee that one second is already durably saved: browser scheduling, the write queue, quota errors, and abrupt termination affect this.
2. **Finalization:** After Stop, the browser builds source files, repairs WebM duration, assembles cursor JSON, and computes waveforms. The finalized files are held in React state. The raw IndexedDB draft stays available; the complete finalized recording is **not yet** written by this finalization path.
3. **Blob upload:** Entering Review automatically uploads the composite and available source assets directly from the browser using `upload()` or `uploadPresigned()`, with multipart enabled. Uploads run concurrently. File progress, completed URLs, and the upload state are held in memory; no upload manifest, resumable part IDs, or durable job queue is stored.
4. **Neon metadata:** Only after all asset uploads resolve does the browser POST their URLs and recording metadata to `/api/recordings`. The route inserts a recording with a temporary title and then its asset rows. The upload completion webhook only logs; it does not complete this database step on behalf of a closed browser.
5. **User title and complete local backup:** The user saves a title after cloud saving succeeds. A PATCH updates the owned Neon row; the full titled recording and all finalized assets are then saved in IndexedDB. Only after that write succeeds is the draft deleted.

### What happens if the user leaves?

| Point of departure | Cloud outcome | Local recovery outcome |
| --- | --- | --- |
| Recording/finalization | No upload has necessarily started. | Last successful media checkpoint can be recovered. Pending writes and recent chunks may be lost. |
| Blob upload | The page cannot be relied on to finish outstanding transfers. Assets that already completed may remain in Blob without a Neon row. | The raw recording draft remains if its writes succeeded. Reopen Studio and choose **Recover latest** to rebuild media and start a fresh upload. |
| All Blobs uploaded, before metadata POST | Uploaded files may exist without a discoverable Library entry. | Same media draft recovery; upload progress/URLs are not restored. |
| Neon POST in flight | The server may finish after the page leaves, or the operation may fail. A lost response does not prove a failed insert. | The draft remains until title/local persistence completes. Check Library before repeating recovery. |
| Cloud save complete, title pending | A Library entry can exist with the temporary title. | The raw draft remains; full finalized local persistence is still pending. |
| Title and local save complete | The named recording and asset references are stored. | The full finalized recording is cached locally and the raw draft has been removed. Library itself lists cloud recordings only. |

Recovery is manual, not automatic upload continuation. `recoverLatestDraft()` repairs/rebuilds the available media files, regenerates available audio waveforms, and starts uploading them from the beginning. It does not recover the original encoder session or an unfinished multipart upload. IndexedDB recovery requires the same browser/profile and site origin, with its storage still intact.

**Cursor limitation:** `snapshotRecordingAssets()` checkpoints only media asset kinds. Cursor JSON is assembled separately during finalization and kept with the in-memory finalized assets until title/local persistence succeeds. If Review is closed before that full local save, draft recovery does not restore cursor JSON. Do not describe this as a guaranteed complete recording backup.

**Database limitations:** POST checks `(user_id, local_id)` for an existing row before inserting, which helps sequential retries after a lost response. It is not strict idempotency: migrations do not enforce a unique owner/local-ID constraint. The recording insert and successive asset inserts are not one transaction. Ordinary asset errors trigger recording-row deletion, but an abrupt function termination can leave partial metadata. A later retry can return an existing incomplete row. Completed Blob files have no cleanup/reconciliation path here. Retrying upload can upload files again before this existing-row check.

### UX protection implemented

- Standard Studio and Presentation share a state-aware leave warning covering finalization, the initial Review/upload gap, Blob upload, Neon saving, failed saving, title entry, and asynchronous title/local saving.
- App links show a reasoned modal with **Stay on this page** as the focused default and **Leave anyway** as an explicit alternative. Escape also stays. Confirming replays the original link, preserving Next.js navigation and existing click handlers.
- Back/Forward navigation between routes is guarded when the browser exposes a cancelable same-document Navigation API event. Older browsers without that support retain link and full-document unload protection; no fake history entries are inserted.
- Close, refresh, address-bar navigation, and other full-document departures use the native `beforeunload` confirmation. Browser-controlled wording cannot include our custom explanation. The Review save status therefore also asks users to keep the page open and explains the interruption risk.
- Warnings are removed once cloud saving, title saving, and complete local persistence have finished. A save finishing while a modal is open dismisses the obsolete warning without navigating automatically. New-tab links, downloads, and same-page fragments are not blocked.

This is a warning, not an upload guarantee. Browsers require prior user interaction for the native prompt and may skip it during crashes, process termination, or some mobile lifecycle events. See [MDN: beforeunload](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event) and [Navigation events](https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigate_event).

### Evidence and later work

The backup/upload conclusions above are based on static inspection of `useRecordingSession.ts`, `recordingAssets.ts`, `recordingFinalization.ts`, `idb.ts`, `useStudioController.ts`, the upload/recordings Route Handlers, and migrations `0001`–`0007`. No live Neon or Blob mutation is needed for this UX change. Interrupted real cloud transfers and recovery of long recordings still require authenticated runtime testing.

Validation: production build and four leave-warning policy tests pass. Lint has zero errors and one pre-existing unused `onOpenPresentation` warning. An isolated Chromium fixture rendering the real warning component passed link cancel/confirm, Escape, default focus, same-document Back cancel/confirm, save-completion dismissal, reload cancellation, and full-document departure without a duplicate prompt; the modal screenshot was visually inspected. This does not constitute a live authenticated Studio/Blob/Neon interruption test.

Future persistence work should first save every finalized asset, especially cursor JSON, before upload; then persist an upload manifest and completed asset URLs, add durable reconciliation/cleanup, and make Neon recording/asset creation transactional with a unique owner/local-ID key. These changes are outside this UX implementation.

## Implemented recovery flow — October 29, 2026

1. Finalization now waits for pending raw checkpoints, then atomically saves the complete recording (composite, available source video/audio, waveforms, cursor JSON) and a lightweight recovery index in IndexedDB. The temporary preview URL is excluded. Upload cannot start unless a full backup write succeeds.
2. Review creates an authenticated upload attempt. Its exact file manifest and unique Blob namespace are stored in Neon. Each retry uses a new attempt ID; retries first check whether the recording was already committed, so a lost response does not cause another upload.
3. Upload runs directly from the browser to Blob with an AbortSignal. Tokens are limited to the attempt's exact paths, MIME types, and file sizes. Tokens cannot be issued for another user's attempt or a cancelled/expired attempt.
4. After every asset finishes, the server checks actual Blob metadata. One atomic SQL statement claims the upload and inserts both recording and asset rows. The unique owner/local-ID index prevents duplicate recordings. A failed asset insert rolls back the entire operation.
5. Confirming **Leave anyway** aborts the uploads and submits cancellation before navigation (up to a five-second request timeout). Merely opening the warning or choosing **Stay** does not cancel anything. Actual page departure also sends a cancellation beacon. A cancellation tombstone prevents a delayed start request from reopening that same attempt.
6. Cancellation and completion compete for the same database row. If completion already won, cancellation leaves the saved recording and files intact. If cancellation won, completion is rejected and server-side cleanup deletes only the exact paths in that attempt's manifest. The complete local backup remains.
7. Verified Blob callbacks clean up files that finish after cancellation in both client-token and presigned modes. An active attempt has a 15-minute lease, renewed once per minute, and a one-hour token expiry. A daily cron expires abandoned attempts and retries cleanup, including delayed completions. Starting another upload also triggers an opportunistic cleanup sweep for that user. Completed attempts are never cleaned by this workflow.
8. Dashboard reads small recovery summaries, filtered by owner for new backups, without loading every recording Blob. Its existing red **Lưu bài giảng ngay** button links to `/studio?recover=<backup-id>`. Studio loads that exact backup, reconstructs only its preview URL, opens Review, and starts saving automatically. It does not ask for media permissions or require a second recovery click. The recovery query is consumed after success so returning to Live Studio does not reload it.
9. After cloud saving, the required title/local completion flow stays in effect. Only a successful full local save after title confirmation removes the recovery backup/index. Cloud success without a received response is discovered on retry rather than deleted. Legacy raw drafts can still be repaired, but missing historical cursor data cannot be recreated.

### Deployment and cleanup limits

- Migration `0008_recording_upload_attempts` adds the upload ledger and unique owner/local-ID index. It was applied and schema-verified on the configured Neon database; no existing recording rows were deleted or rewritten.
- `vercel.json` schedules `/api/recording-uploads/cleanup` daily at `00:00 UTC`. **Set a strong `CRON_SECRET` in Vercel before deployment.** The endpoint fails closed without it, and Vercel supplies the bearer header automatically. See [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- Immediate cleanup is best-effort when a tab closes or the network disappears; durable expiry and the cron are the fallback. The UI does not claim deletion has completed synchronously at tab close. Upload cancellation aborts transfers and deletes completed Blob objects; unfinished multipart staging is managed by the storage provider.
- Old orphan files outside the new `recording-uploads/<attempt-id>/` namespaces are intentionally outside this cleanup mechanism. Local recovery still depends on this browser/profile/origin retaining its IndexedDB storage. Legacy backups have no owner identity and retain their prior manual-recovery behavior; new backups are owner-tagged.

### Verification

- `npm run test:recording-storage`: tests backup-before-upload, quota failure, network failure, cancellation, page-exit beacon, existing-recording reuse, and manifest validation.
- `npm run test:upload-database`: executes the production server lifecycle against real PostgreSQL with mocked Blob operations; all fixture rows are inside a transaction that is rolled back. Covers ownership, duplicate active attempts, cancellation-before-start, late callbacks, completed-record protection, expiry cleanup, atomic metadata rollback, and uniqueness.
- An isolated Chromium fixture using the actual IndexedDB and leave-warning modules verifies video/cursor survival across reload, account-filtered summaries, index deletion, and link/Back/reload cancel/confirm behavior.
- Build/lint validation is recorded in `MEMORY.md`. Real authenticated long-session capture, end-to-end Blob network interruption, and production cron execution still require deployment/runtime QA.

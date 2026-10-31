Your concern is correct: RecordWeb backs up recording data locally, but does not persist a resumable upload session.

Current behavior:

- Media chunks are checkpointed to IndexedDB while recording.
- Review uploads the files to Blob, then saves their metadata to Neon.
- Closing during upload can interrupt transfers. Completed files may remain in Blob without a Library entry.
- Reopening Studio → **Recover latest** rebuilds saved media and uploads it again from the beginning.
- Crucially, cursor JSON is not included in those raw checkpoints. The complete finalized local backup is saved only after title saving succeeds.
- If Neon saving was already underway, it may finish despite the page closing.

I added the detailed findings to [stored-processing.md](/Users/caoquanghung/HCMUS/HCI/code/webDev/recordweb/docs/note-note/stored-processing.md:9).

The UX warning is implemented for Standard Studio and Presentation:

- App navigation shows the reason, with **Stay on this page** and **Leave anyway**.
- Closing or refreshing uses the browser’s confirmation. Browsers control its wording, so the save screen also explains why users should wait. [Browser limitations](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
- Protection covers preparation, uploads, metadata saving, failed saves, and unfinished title/local saving.

Build, four policy tests, and isolated Chromium navigation checks passed. Lint has one existing warning. Backend persistence logic is unchanged; live interrupted Blob/Neon transfers have not been runtime-tested.
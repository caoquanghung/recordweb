# Recording Project Modules

## Purpose

These modules let one lecture span multiple finalized recording sessions. Closing
the browser or turning off the computer ends the current `MediaRecorder`; a later
session creates a new immutable segment and attaches it to the same project.

The implementation intentionally has no UI integration yet. It provides:

1. Project and segment persistence through authenticated Route Handlers.
2. Continuous-playback timeline calculations over finalized segments.
3. Strict media-profile inspection and compatibility checks.
4. Lossless MP4/WebM packet-copy merging without decoding or transcoding.

Finalized `recordings` remain the storage source of truth. A project segment is a
small association to an existing owned recording, so attaching a segment does not
duplicate Blob objects or recording metadata.

## Migration

Migration `database/migrations/0005_recording_projects.sql` adds:

- `recording_projects`: owner, title, status, project profile, settings, and an
  optimistic-lock `revision`.
- `recording_project_segments`: ordered associations between projects and existing
  finalized `recordings`.

The unique `(project_id, sequence_number)` constraint is deferrable so a complete
reorder can be committed atomically. Deleting a project or detaching a segment does
not delete the underlying finalized recording or its Vercel Blob assets.

Before using the API in an environment, apply and verify the migration through the
controlled database workflow:

```bash
npm run db:status
npm run db:migrate
npm run db:verify
```

## Module map

| Module | Responsibility |
| --- | --- |
| `src/types/recordingProject.ts` | Project, segment, playlist, and immutable media-profile contracts |
| `src/lib/recordingProjects.ts` | Pure validation, profile comparison, playlist construction, and global-time lookup |
| `src/lib/recordingProjectClient.ts` | Typed browser client for project and segment APIs |
| `src/lib/segmentMerger.ts` | Blob inspection and lossless packet-copy merge using Mediabunny |
| `src/app/api/recording-projects/route.ts` | Owned project list/create/update/delete operations |
| `src/app/api/recording-projects/segments/route.ts` | Attach, reorder, and detach operations |

## Phase 1: resumable projects and continuous playback

### Create a project

A project may be created before the first recording. Its `mediaProfile` can be
`null`; attaching the first segment then locks the project to that inspected
profile.

```ts
import { createRecordingProject } from '@/lib/recordingProjectClient';

const project = await createRecordingProject({
  title: 'Human–Computer Interaction — Lecture 1',
  settings: { courseCode: 'HCI101' },
});
```

### Finalize and upload a segment

Use the existing recording lifecycle and upload flow first. A segment can only be
attached after its `recordings` row belongs to the current user and has a non-null
`storage_url`.

Inspect the finalized composite Blob rather than constructing a profile from UI
settings:

```ts
import { inspectFinalizedSegment } from '@/lib/segmentMerger';
import { attachRecordingProjectSegment } from '@/lib/recordingProjectClient';

const mediaProfile = await inspectFinalizedSegment(compositeBlob);

const { revision } = await attachRecordingProjectSegment({
  projectId: project.id,
  recordingId: cloudRecording.id,
  expectedRevision: project.revision,
  mediaProfile,
});
```

`expectedRevision` is mandatory. A `409` response means another tab or request
changed the project; reload the latest project before retrying.

### Build one continuous timeline

```ts
import {
  buildRecordingPlaylist,
  findPlaylistItemAtTime,
} from '@/lib/recordingProjects';

const playlist = buildRecordingPlaylist(project.segments);
const target = findPlaylistItemAtTime(playlist, 725.5);

if (target) {
  const segmentUrl = target.item.segment.storageUrl;
  const localTime = target.segmentTimeSeconds;
  // A future UI player sets <video src={segmentUrl}> and currentTime = localTime.
}
```

When the current `<video>` emits `ended`, advance to the next playlist item. The
project timeline is derived from ordered segment durations, so it requires no media
rewrite.

### Reorder, detach, and complete

```ts
import {
  detachRecordingProjectSegment,
  reorderRecordingProjectSegments,
  updateRecordingProject,
} from '@/lib/recordingProjectClient';

const nextRevision = await reorderRecordingProjectSegments({
  projectId: project.id,
  segmentIds: orderedSegmentIds,
  expectedRevision: project.revision,
});

await detachRecordingProjectSegment({
  projectId: project.id,
  segmentId,
  expectedRevision: nextRevision,
});

await updateRecordingProject({
  id: project.id,
  expectedRevision: latestRevision,
  status: 'completed',
});
```

Only draft projects accept segment mutations. A completed project can be reopened
by updating its status to `draft` with the latest revision.

## Phase 2: lossless fast merge

`mergeFinalizedSegments()` accepts ordered composite Blobs. It:

1. Parses each finalized MP4/WebM.
2. Requires exactly one video track and at most one audio track.
3. Compares container, codec parameter strings, decoder configuration, dimensions,
   rotation, frame rate, audio sample rate, and channel count.
4. Requires every independent video segment to start with a key frame.
5. Copies encoded packets into one new container while shifting timestamps.

No frame or audio sample is decoded or re-encoded. An incompatible segment throws
`SegmentMergeError`; there is intentionally no hidden transcode fallback.

```ts
import { mergeFinalizedSegments } from '@/lib/segmentMerger';

const controller = new AbortController();
const merged = await mergeFinalizedSegments(
  [
    { id: 'segment-1', blob: firstCompositeBlob },
    { id: 'segment-2', blob: secondCompositeBlob },
  ],
  {
    signal: controller.signal,
    onProgress: ({ percentage }) => {
      console.log(`Remux progress: ${percentage}%`);
    },
  },
);

// merged.blob is ready for local download or direct @vercel/blob/client upload.
// merged.sourceSegmentIds preserves the exact source order.
```

The current implementation uses an in-memory `BufferTarget`; peak memory therefore
includes the output file plus Mediabunny's bounded input caches. Keep source
segments immutable and do not delete them after producing a merged derivative.

## Recommended orchestration flow

```text
Create/open draft project
  → record one normal session
  → stop and finalize through useRecordingSession
  → save locally and upload through the existing direct-to-Blob flow
  → inspect the finalized composite Blob
  → attach the resulting recordings row as the next segment
  → repeat on any later day
  → build a logical playlist for continuous playback
  → optionally fast-merge ordered composite Blobs
  → mark the project completed
```

The existing 30-minute active-time limit remains per recording segment. A project
may contain multiple segments and therefore exceed 30 minutes in total.

## Error handling

- Treat HTTP `409` as a stale project revision or incompatible project mutation;
  refresh before retrying.
- Keep the local finalized recording when upload or attachment fails.
- Treat `RecordingProjectValidationError` as invalid timeline/order/profile input.
- Treat `SegmentMergeError` as an unsupported or incompatible media file.
- Treat an error named `AbortError` as a user-requested merge cancellation.
- Never delete source segments merely because merge or upload of the derivative
  failed.

## Verification status

- Static module and ownership flow inspection: completed.
- ESLint and Next.js production build: required after every change.
- Real-browser MP4/WebM merge, long-duration memory, and cross-day authenticated
  upload/playback: still require runtime verification with actual recorded files.


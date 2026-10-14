---
name: media-pipeline-verifier
description: >-
  Inspect, verify, and debug RecordWeb's raw MediaStream acquisition and ownership,
  Web Audio DSP graph, coordinated multi-asset MediaRecorder lifecycle, and local
  recording finalization. Use for capture, audio, recorder, cleanup, or recovery
  changes and failures. Excludes canvas composition, frame scheduling, and MediaPipe
  segmentation validation, which belong to canvas-compositor-check.
---

# Media Pipeline Verifier

Verify the implemented media lifecycle without changing behavior unless the user
also asks for a fix. Preserve RecordWeb's client-side architecture and distinguish
code inspection from behavior actually exercised in a browser.

## Sources of Truth

Before assessing a media change, read the relevant sections of:

- `docs/system_architecture.md`
- `docs/audio_video_pipeline.md`
- `MEMORY.md`

Trace the current implementation rather than relying on this checklist alone. The
primary files are:

- `src/hooks/useMediaDevices.ts`
- `src/components/media/MediaSessionProvider.tsx`
- `src/hooks/useAudioDSP.ts`
- `src/hooks/useRecordingSession.ts`
- `src/lib/ebmlPatcher.ts`
- `src/lib/idb.ts`
- The caller in `src/components/studio/StudioShell.tsx`

Use `canvas-compositor-check` for `useCanvasCompositor`,
`useNormalizedVideoStream`, `useVisionSegmentation`, or visibility-aware frame-loop
behavior. Do not duplicate that skill's checks here.

## Evidence Levels

Label the evidence behind every conclusion:

1. **Static**: verified from types, control flow, constraints, handlers, and cleanup.
2. **Build**: lint, TypeScript, tests, or production build executed successfully.
3. **Runtime**: exercised with real browser permissions, devices, tracks, audio, and
   encoded output.

Never report camera, microphone, system-audio, pause/resume, duration repair, or
browser compatibility as runtime-verified when only static checks or a build ran.

## Verification Workflow

### 1. Establish Ownership and Call Flow

- Confirm `MediaSessionProvider` mounts `useMediaDevices` at the root so raw screen,
  camera, and microphone streams survive route navigation.
- Trace consumers before judging cleanup. Raw capture tracks belong to the provider;
  compositor, normalization, DSP, and recorder code must not accidentally assume
  ownership of those raw tracks.
- Identify whether the request concerns acquisition, DSP, recording, finalization,
  or recovery, and keep the investigation within that boundary.

### 2. MediaStream Acquisition

Verify all of the following:

- Unsupported `navigator.mediaDevices`, `getUserMedia`, `getDisplayMedia`, and
  `enumerateDevices` paths return useful state/errors without unhandled rejection.
- Permission, missing-device, busy-device, unsupported-constraint, and unknown
  failures map to the existing public error contract.
- Screen and camera video request `1920x1080` ideals with
  `{ frameRate: { ideal: 30, max: 30 } }`.
- Camera and microphone device selection uses an exact `deviceId` only when one is
  supplied. Microphone echo cancellation, noise suppression, automatic gain, and
  mono preference remain intact.
- A replacement stream installs its `ended` handlers before the previous owned
  stream is stopped. A stale stream's `ended` event must not clear a newer stream.
- Explicit stop, replacement, external share termination, and provider unmount all
  stop every owned track with `track.stop()` and clear handlers where appropriate.
- The `devicechange` listener and initial enumeration timer are removed on cleanup.
- System audio is derived from the screen stream's audio tracks and is not treated
  as a separately owned raw capture that can outlive the screen stream.
- Status transitions remain coherent: `requesting` to `ready`, mapped error state,
  `ended`, or `idle`.

Runtime checks, when the environment permits them, should cover permission denial,
camera/microphone replacement, browser-level "Stop sharing", device unplug, route
navigation, and the global disconnect controls.

### 3. Web Audio DSP

Verify the graph topology rather than checking isolated node values:

```text
Microphone -> High-pass -> Presence EQ -> Low-pass -> Compressor
           -> Gate -> Microphone gain -> Destination
                                      -> Meter analyser

Compressor -> Gate analyser (measurement branch)

System audio -> System gain -> Destination
                           -> Meter analyser
```

Check these invariants:

- System audio bypasses the vocal filter and noise-gate chain.
- Presence EQ remains centered at `2800Hz` with `Q = 1.2`; compressor attack and
  release remain configured for smooth voice processing.
- High-pass, presence gain, low-pass, compressor, and gate values come from
  `getPresetParameters()`. Do not require `80Hz`/`12000Hz` for every preset:
  Natural, Noise Reduction, Podcast, Voice Clarity, and Custom intentionally differ.
- Live preset and gain changes use smoothed `setTargetAtTime()` updates. Mute and
  gate transitions must not use abrupt gain steps that can click or pop.
- The noise gate measures the microphone branch, applies the configured threshold,
  preserves the voice hold interval, and uses smooth open/close envelopes.
- `AudioContext.resume()` is reachable from a real user gesture. Trace the caller in
  `StudioShell`; the hook exposing `resume()` alone does not prove autoplay safety.
- The analyser is a side branch and does not interrupt audio flowing to the
  `MediaStreamAudioDestinationNode`.
- Source replacement or unmount cancels the meter RAF, disconnects every created
  node, stops generated destination tracks, clears `onstatechange`, and closes the
  `AudioContext`.

Runtime checks should cover microphone-only, system-audio-only, mixed input, mute,
gain changes, every preset, VU response, source replacement, and repeated connect /
disconnect cycles without audible glitches or leaked device indicators.

### 4. Coordinated Multi-Asset Recording

RecordWeb coordinates separate encoders for the available assets:

- Composite: one composited video track plus at most one processed audio track.
- Webcam: one normalized `1280x720` video track and no audio.
- Screen: one normalized `1920x1080` video track and no audio.
- Audio: one processed audio track and no video.
- Cursor: Electron-assisted JSON capture synchronized separately with the same
  active-time lifecycle.

Verify these invariants:

- No `MediaRecorder` receives multiple video tracks.
- Codec selection prefers supported MP4 variants and falls back through supported
  WebM variants appropriate to composite, video-only, or audio-only assets.
- Every recorder starts with a `1000ms` timeslice.
- `ondataavailable` ignores empty data, appends valid chunks to the correct asset,
  and schedules an IndexedDB draft checkpoint.
- `onerror` treats composite failure as fatal while allowing optional source assets
  to fail with a partial-session warning.
- Pause, resume, and stop apply to every active recorder and to cursor capture.
  Paused time is excluded from the shared active-time clock.
- The timer warns at 15 minutes and during the final minute, and hard-stops at
  30 minutes of active recording.
- `onstop` marks an asset stopped. Finalization begins only after the coordinated
  stop barrier observes every created recorder as stopped; `onstop` does not repair
  a blob directly.
- Unmount stops active recorders, clears the timer, resets cursor capture, and
  revokes any preview object URL.

Runtime checks should exercise composite-only and all-asset sessions, pause/resume,
optional source loss, repeated start/stop cycles, and output track counts.

### 5. Finalization, Repair, and Recovery

Verify the post-stop order:

1. Build each available asset blob from its own chunks and recorded MIME type.
2. Repair every WebM asset independently with the shared active duration; do not
   apply WebM repair to MP4 or cursor JSON.
3. Decode waveform metadata from the standalone audio asset when available without
   making waveform failure fatal to the recording.
4. Require a usable composite, then create its preview URL and persist the complete
   local recording in IndexedDB.
5. Await pending draft writes before deleting the finalized draft.
6. Surface optional asset and cursor failures as warnings without discarding a valid
   composite.

For runtime verification, confirm finalized WebM outputs report a finite duration,
seek correctly, use extensions matching their MIME types, and remain recoverable
from IndexedDB after an interrupted session.

## Validation and Report

Run the narrowest relevant checks first, then the repository checks required by
`AGENTS.md`, normally:

```bash
npm run lint
npm run build
```

Hardware and browser checks require an interactive browser on HTTPS or localhost;
do not substitute a successful build for them. Do not run unrelated database or
cloud operations for a local media-pipeline verification.

Report:

- Scope and files inspected.
- Evidence level for each verified claim.
- Findings ordered by correctness risk.
- Commands and runtime scenarios actually executed.
- Cleanup, synchronization, and partial-failure results.
- Any browser, hardware, or permission scenarios that remain unverified.

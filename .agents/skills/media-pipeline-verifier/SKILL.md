---
name: media-pipeline-verifier
description: >-
  Use this skill to inspect, verify, and debug MediaStream acquisition, Web Audio DSP filter nodes, and MediaRecorder lifecycle events in RecordWeb.
---

# Media Pipeline Verifier

This skill guides the agent through verifying and troubleshooting audio/video capture, Web Audio DSP graphs, and recording outputs.

## Verification Checklist

### 1. MediaStream Acquisition
* Check that `navigator.mediaDevices.getUserMedia` and `navigator.mediaDevices.getDisplayMedia` queries handle permission rejection gracefully without unhandled exceptions.
* Verify that video tracks specify `{ frameRate: { ideal: 30, max: 30 } }`.
* Verify that prior tracks are stopped with `track.stop()` when devices are toggled.

### 2. Web Audio DSP Filter Verification
* Verify that `AudioContext.state` is resumed on the first user interaction gesture.
* Inspect that the high-pass filter frequency is set to `80Hz`.
* Inspect that the peaking filter frequency is set to `2800Hz` with appropriate gain.
* Inspect that the low-pass filter frequency is set to `12000Hz`.
* Ensure `AnalyserNode` connects without disrupting the audio flow to `MediaStreamAudioDestinationNode`.

### 3. MediaRecorder Event Handlers
* Verify `mediaRecorder.ondataavailable` appends valid `data.size > 0` chunks.
* Verify `mediaRecorder.pause()` and `mediaRecorder.resume()` trigger state changes and update the visual timer state.
* Verify `mediaRecorder.onstop` triggers the EBML duration repair before generating the download link.

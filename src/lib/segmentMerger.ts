import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  WEBM,
  WebMOutputFormat,
  type AudioCodec,
  type InputAudioTrack,
  type InputVideoTrack,
  type VideoCodec,
} from 'mediabunny';
import {
  assertCompatibleRecordingMediaProfiles,
  RecordingProjectValidationError,
} from '@/lib/recordingProjects';
import type { RecordingContainer, RecordingMediaProfile } from '@/types/recordingProject';

export interface FinalizedSegmentSource {
  id: string;
  blob: Blob;
}

export interface SegmentMergeProgress {
  segmentId: string;
  segmentIndex: number;
  segmentCount: number;
  processedBytes: number;
  totalBytes: number;
  percentage: number;
}

export interface MergeFinalizedSegmentsOptions {
  signal?: AbortSignal;
  onProgress?: (progress: SegmentMergeProgress) => void;
}

export interface MergedRecordingResult {
  blob: Blob;
  durationSeconds: number;
  mimeType: string;
  profile: RecordingMediaProfile;
  sourceSegmentIds: string[];
}

interface OpenSegment {
  source: FinalizedSegmentSource;
  input: Input<BlobSource>;
  videoTrack: InputVideoTrack;
  audioTrack: InputAudioTrack | null;
  videoDecoderConfig: VideoDecoderConfig | null;
  audioDecoderConfig: AudioDecoderConfig | null;
  profile: RecordingMediaProfile;
  firstTimestamp: number;
  durationSeconds: number;
}

export class SegmentMergeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SegmentMergeError';
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error('Segment merge was canceled.');
  error.name = 'AbortError';
  throw error;
}

function bufferSourceFingerprint(value: AllowSharedBufferSource | undefined): string | null {
  if (!value) return null;
  const bytes = ArrayBuffer.isView(value)
    ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    : new Uint8Array(value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function detectContainer(input: Input<BlobSource>): Promise<{
  container: RecordingContainer;
  mimeType: RecordingMediaProfile['mimeType'];
}> {
  const format = await input.getFormat();
  if (format === MP4) return { container: 'mp4', mimeType: 'video/mp4' };
  if (format === WEBM) return { container: 'webm', mimeType: 'video/webm' };
  throw new SegmentMergeError(`Unsupported segment container: ${format.name}. Only MP4 and WebM are supported.`);
}

async function openSegment(source: FinalizedSegmentSource): Promise<OpenSegment> {
  if (!source.id || !(source.blob instanceof Blob) || source.blob.size === 0) {
    throw new SegmentMergeError('Every finalized segment must have an ID and a non-empty Blob.');
  }

  const input = new Input({ source: new BlobSource(source.blob), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) {
      throw new SegmentMergeError(`Segment ${source.id} is not a readable media file.`);
    }
    const { container, mimeType } = await detectContainer(input);
    const videoTracks = await input.getVideoTracks();
    const audioTracks = await input.getAudioTracks();
    if (videoTracks.length !== 1 || audioTracks.length > 1) {
      throw new SegmentMergeError(
        `Segment ${source.id} must contain exactly one video track and at most one audio track.`,
      );
    }

    const videoTrack = videoTracks[0];
    const audioTrack = audioTracks[0] ?? null;
    const videoCodec = await videoTrack.getCodec();
    const videoDecoderConfig = await videoTrack.getDecoderConfig();
    if (!videoCodec) throw new SegmentMergeError(`Segment ${source.id} uses an unknown video codec.`);

    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
    const audioDecoderConfig = audioTrack ? await audioTrack.getDecoderConfig() : null;
    if (audioTrack && !audioCodec) {
      throw new SegmentMergeError(`Segment ${source.id} uses an unknown audio codec.`);
    }

    const tracks = audioTrack ? [videoTrack, audioTrack] : [videoTrack];
    const firstTimestamp = await input.getFirstTimestamp(tracks);
    const endTimestamp = await input.computeDuration(tracks);
    const durationSeconds = endTimestamp - firstTimestamp;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new SegmentMergeError(`Segment ${source.id} has an invalid duration.`);
    }

    const frameRate = (await videoTrack.computeFrameRateMetrics()).bestGuessFrameRate;
    if (!Number.isFinite(frameRate) || frameRate <= 0) {
      throw new SegmentMergeError(`Segment ${source.id} has an unreadable frame rate.`);
    }

    const profile: RecordingMediaProfile = {
      schemaVersion: 1,
      container,
      mimeType,
      video: {
        codec: videoCodec,
        codecParameterString: await videoTrack.getCodecParameterString() ?? videoDecoderConfig?.codec ?? videoCodec,
        decoderConfigDescription: bufferSourceFingerprint(videoDecoderConfig?.description),
        width: await videoTrack.getDisplayWidth(),
        height: await videoTrack.getDisplayHeight(),
        rotation: await videoTrack.getRotation(),
        flipped: await videoTrack.getFlip(),
        frameRate,
      },
      audio: audioTrack && audioCodec ? {
        codec: audioCodec,
        codecParameterString: await audioTrack.getCodecParameterString() ?? audioDecoderConfig?.codec ?? audioCodec,
        decoderConfigDescription: bufferSourceFingerprint(audioDecoderConfig?.description),
        sampleRate: await audioTrack.getSampleRate(),
        numberOfChannels: await audioTrack.getNumberOfChannels(),
      } : null,
    };

    return {
      source,
      input,
      videoTrack,
      audioTrack,
      videoDecoderConfig,
      audioDecoderConfig,
      profile,
      firstTimestamp,
      durationSeconds,
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

export async function inspectFinalizedSegment(blob: Blob): Promise<RecordingMediaProfile> {
  const segment = await openSegment({ id: 'inspection', blob });
  try {
    return segment.profile;
  } finally {
    segment.input.dispose();
  }
}

function outputFormatFor(container: RecordingContainer) {
  return container === 'mp4'
    ? new Mp4OutputFormat({ fastStart: 'in-memory' })
    : new WebMOutputFormat();
}

export async function mergeFinalizedSegments(
  sources: readonly FinalizedSegmentSource[],
  options: MergeFinalizedSegmentsOptions = {},
): Promise<MergedRecordingResult> {
  if (sources.length === 0) throw new SegmentMergeError('At least one finalized segment is required.');
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new SegmentMergeError('Segment IDs must be unique.');
  }
  throwIfAborted(options.signal);

  const segments: OpenSegment[] = [];
  let output: Output | null = null;
  try {
    for (const source of sources) {
      throwIfAborted(options.signal);
      segments.push(await openSegment(source));
    }

    const expectedProfile = segments[0].profile;
    for (const segment of segments.slice(1)) {
      try {
        assertCompatibleRecordingMediaProfiles(expectedProfile, segment.profile);
      } catch (error) {
        if (error instanceof RecordingProjectValidationError) {
          throw new SegmentMergeError(`Segment ${segment.source.id} cannot be fast-merged. ${error.message}`);
        }
        throw error;
      }
    }

    const first = segments[0];
    const target = new BufferTarget();
    output = new Output({ format: outputFormatFor(expectedProfile.container), target });
    const videoSource = new EncodedVideoPacketSource(expectedProfile.video.codec as VideoCodec);
    const audioSource = expectedProfile.audio
      ? new EncodedAudioPacketSource(expectedProfile.audio.codec as AudioCodec)
      : null;

    output.addVideoTrack(videoSource, {
      decoderConfig: first.videoDecoderConfig ?? undefined,
      rotation: expectedProfile.video.rotation,
      flip: expectedProfile.video.flipped,
    });
    if (audioSource) {
      output.addAudioTrack(audioSource, {
        decoderConfig: first.audioDecoderConfig ?? undefined,
      });
    }
    await output.start();

    const totalBytes = sources.reduce((total, source) => total + source.blob.size, 0);
    let processedBytes = 0;
    let lastPercentage = -1;
    let timelineOffset = 0;
    let videoSequenceNumber = 0;
    let audioSequenceNumber = 0;

    const reportProgress = (segment: OpenSegment, segmentIndex: number, bytes: number) => {
      processedBytes += bytes;
      const percentage = Math.min(100, Math.floor((processedBytes / totalBytes) * 100));
      if (percentage === lastPercentage) return;
      lastPercentage = percentage;
      options.onProgress?.({
        segmentId: segment.source.id,
        segmentIndex,
        segmentCount: segments.length,
        processedBytes,
        totalBytes,
        percentage,
      });
    };

    for (const [segmentIndex, segment] of segments.entries()) {
      throwIfAborted(options.signal);
      const timestampShift = timelineOffset - segment.firstTimestamp;

      const pipeVideo = async () => {
        const sink = new EncodedPacketSink(segment.videoTrack);
        let packetIndex = 0;
        for await (const packet of sink.packets(undefined, undefined, { verifyKeyPackets: true })) {
          throwIfAborted(options.signal);
          if (packetIndex === 0 && packet.type !== 'key') {
            throw new SegmentMergeError(`Segment ${segment.source.id} does not begin with a video key frame.`);
          }
          const shifted = packet.clone({
            timestamp: packet.timestamp + timestampShift,
            sequenceNumber: videoSequenceNumber++,
          });
          await videoSource.add(shifted, packetIndex === 0 ? {
            decoderConfig: segment.videoDecoderConfig ?? undefined,
          } : undefined);
          packetIndex++;
          reportProgress(segment, segmentIndex, packet.byteLength);
        }
      };

      const pipeAudio = async () => {
        if (!segment.audioTrack || !audioSource) return;
        const sink = new EncodedPacketSink(segment.audioTrack);
        let packetIndex = 0;
        for await (const packet of sink.packets()) {
          throwIfAborted(options.signal);
          const shifted = packet.clone({
            timestamp: packet.timestamp + timestampShift,
            sequenceNumber: audioSequenceNumber++,
          });
          await audioSource.add(shifted, packetIndex === 0 ? {
            decoderConfig: segment.audioDecoderConfig ?? undefined,
          } : undefined);
          packetIndex++;
          reportProgress(segment, segmentIndex, packet.byteLength);
        }
      };

      await Promise.all([pipeVideo(), pipeAudio()]);
      timelineOffset += segment.durationSeconds;
    }

    videoSource.close();
    audioSource?.close();
    await output.finalize();
    if (!target.buffer) throw new SegmentMergeError('The muxer did not produce an output buffer.');
    const mimeType = await output.getMimeType();
    options.onProgress?.({
      segmentId: segments.at(-1)?.source.id ?? sources[0].id,
      segmentIndex: segments.length - 1,
      segmentCount: segments.length,
      processedBytes: totalBytes,
      totalBytes,
      percentage: 100,
    });

    return {
      blob: new Blob([target.buffer], { type: mimeType }),
      durationSeconds: timelineOffset,
      mimeType,
      profile: expectedProfile,
      sourceSegmentIds: sources.map((source) => source.id),
    };
  } catch (error) {
    if (output && output.state !== 'finalized' && output.state !== 'canceled') {
      await output.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    segments.forEach((segment) => segment.input.dispose());
  }
}


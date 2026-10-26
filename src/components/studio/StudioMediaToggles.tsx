import type { StudioController } from './useStudioController';
import { StudioIcon } from './StudioPrimitives';
import styles from './StudioShell.module.css';

export function StudioMediaToggles({ studio }: { studio: StudioController }) {
  const microphoneConnected = Boolean(
    studio.microphoneStream?.getAudioTracks().some((track) => track.readyState === 'live'),
  );
  const cameraConnected = Boolean(
    studio.cameraStream?.getVideoTracks().some((track) => track.readyState === 'live'),
  );
  const microphoneOn = microphoneConnected && !studio.micMuted;
  const cameraOn = cameraConnected && studio.cameraVisible;
  const microphoneLabel = microphoneConnected
    ? microphoneOn ? 'Mute microphone' : 'Unmute microphone'
    : 'Microphone disconnected';
  const cameraLabel = cameraConnected
    ? cameraOn ? 'Turn off camera' : 'Turn on camera'
    : 'Camera disconnected';

  return (
    <>
      <button
        className={`${styles.roundControl} ${microphoneOn ? '' : styles.controlOff}`}
        type="button"
        onClick={() => studio.setMicMuted((value) => !value)}
        disabled={!microphoneConnected}
        aria-label={microphoneLabel}
        aria-pressed={microphoneOn}
        title={microphoneLabel}
      >
        <StudioIcon name={microphoneOn ? 'mic' : 'micOff'} />
      </button>
      <button
        className={`${styles.roundControl} ${cameraOn ? '' : styles.controlOff}`}
        type="button"
        onClick={() => studio.setCameraVisible((value) => !value)}
        disabled={!cameraConnected}
        aria-label={cameraLabel}
        aria-pressed={cameraOn}
        title={cameraLabel}
      >
        <StudioIcon name={cameraOn ? 'camera' : 'cameraOff'} />
      </button>
    </>
  );
}

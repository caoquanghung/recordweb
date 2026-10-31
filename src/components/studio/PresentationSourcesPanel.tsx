import { StatusDot } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioShell.module.css';

export function PresentationSourcesPanel({ studio }: { studio: StudioController }) {
  const {
    presentationDeck,
    presentationSource,
    selectedCameraId,
    setSelectedCameraId,
    selectedMicrophoneId,
    setSelectedMicrophoneId,
    cameras,
    microphones,
    isConnectingSources,
    connectSources,
    stopAllMedia,
    cameraStream,
    microphoneStream,
    mediaStatuses,
    mediaError,
  } = studio;
  const devicesConnected = Boolean(cameraStream || microphoneStream);

  const disconnect = () => {
    presentationSource.stop();
    stopAllMedia();
  };

  return (
    <aside className={styles.leftPanel}>
      <section className={styles.panelSection}>
        <div className={styles.sectionHeading}>
          <div><span>01</span><h2>Lecture file</h2></div>
          <span className={styles.readyLabel}>{presentationDeck.status === 'ready' ? 'Ready' : 'Local'}</span>
        </div>
        <div className={styles.sourceStatus}>
          <StatusDot ok={presentationDeck.status === 'ready'} />
          <span>
            {presentationDeck.metadata
              ? `${presentationDeck.metadata.name} · ${presentationDeck.metadata.pageCount} slides`
              : 'Choose a PDF or PPTX in the presentation area.'}
          </span>
        </div>
        <div className={styles.sourceStatus}>
          <StatusDot ok={presentationSource.status === 'capturing'} />
          <span>
            {presentationSource.capture
              ? `Capture scope: ${presentationSource.capture.scope === 'element' ? 'presentation only' : 'clean browser tab'}`
              : 'Current-tab capture starts when recording begins.'}
          </span>
        </div>
        {presentationSource.warning && <p className={styles.sourceWarning}>{presentationSource.warning}</p>}
        {presentationSource.error && <p className={styles.sourceError} role="alert">{presentationSource.error}</p>}
      </section>

      <section className={styles.panelSection}>
        <div className={styles.sectionHeading}>
          <div><span>02</span><h2>Camera & microphone</h2></div>
        </div>
        <label className={styles.fieldLabel}>
          Camera
          <select value={selectedCameraId} onChange={(event) => setSelectedCameraId(event.target.value)}>
            <option value="">Default camera</option>
            {cameras.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>
            ))}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Microphone
          <select value={selectedMicrophoneId} onChange={(event) => setSelectedMicrophoneId(event.target.value)}>
            <option value="">Default microphone</option>
            {microphones.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>
            ))}
          </select>
        </label>
        <div className={styles.sourceActions}>
          <button className={styles.sourceButton} type="button" onClick={() => void connectSources()} disabled={isConnectingSources}>
            {isConnectingSources ? 'Requesting access…' : devicesConnected ? 'Update devices' : 'Connect devices'}
          </button>
          {devicesConnected && <button className={styles.sourceStopButton} type="button" onClick={disconnect}>Disconnect</button>}
        </div>
        <div className={styles.sourceStatus}>
          <StatusDot ok={mediaStatuses.camera === 'ready'} />
          <span>Camera {mediaStatuses.camera} · microphone {mediaStatuses.microphone}</span>
        </div>
        {mediaError && <p className={styles.sourceError} role="alert">{mediaError.message}</p>}
      </section>

      <section className={styles.panelSection}>
        <div className={styles.sectionHeading}>
          <div><span>03</span><h2>Output</h2></div>
        </div>
        <div className={styles.outputMeta}>
          <span>30 FPS</span><span>16:9</span><span>30 min max</span>
        </div>
      </section>
    </aside>
  );
}

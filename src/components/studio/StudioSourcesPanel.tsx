import { AudioMeterPanel } from './AudioMeterPanel';
import { modes } from './studioConfig';
import { StatusDot, StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioShell.module.css';

interface SourcesSectionProps {
  studio: StudioController;
}

export function StudioSourcesPanel({ studio }: SourcesSectionProps) {
  const needsSlides = studio.mode !== 'webcam-only';
  const slidesReady = Boolean(
    studio.screenStream?.getVideoTracks().some((track) => track.readyState === 'live')
      && studio.tabCapture.connected,
  );

  return (
    <aside className={`${styles.leftPanel} ${styles.setupInspector}`} aria-label="Sources and inputs">
      <header className={styles.inspectorHeader}>
        <div><StudioIcon name="screen" /><h2>Sources &amp; Inputs</h2></div>
        <span className={studio.recordingReady ? styles.inspectorReady : styles.inspectorPending} role="status">
          {studio.recordingReady ? 'Ready' : 'Setup'}
        </span>
      </header>

      <div className={styles.inspectorBody}>
        <div className={styles.inspectorKicker}>
          <span>RECORDING SETUP</span>
          <strong>{Number(studio.requiredDevicesConnected) + Number(needsSlides && slidesReady)} / {needsSlides ? 2 : 1} ready</strong>
        </div>

        <DeviceConnectionStep studio={studio} />
        {needsSlides && <SlidesConnectionStep studio={studio} slidesReady={slidesReady} />}

        <div className={styles.inspectorTip}>
          <StudioIcon name="shield" />
          <p>{studio.recordingReady ? 'Ready. You can start recording from the control below the preview.' : 'Your sources stay on this device until you choose to upload a recording.'}</p>
        </div>

        <SourceSettings studio={studio} />
        {studio.mediaError && <p className={styles.sourceError} role="alert">{studio.mediaError.message}</p>}
      </div>

      <footer className={styles.inspectorFooter}><StudioIcon name="check" /> {studio.mode === 'screen-only' ? 'Screen only' : 'Original camera'} · 30 FPS</footer>
    </aside>
  );
}

function DeviceConnectionStep({ studio }: SourcesSectionProps) {
  const {
    mode, selectedCameraId, selectedMicrophoneId, cameras, microphones,
    requiredDevicesConnected, isConnectingSources, isConnectingSlideSource,
    connectSources, mediaStatuses, audioState, resumeAudio,
    microphoneLevel, microphoneLevelDb, microphoneStream,
  } = studio;
  const cameraName = cameras.find((device) => device.deviceId === selectedCameraId)?.label
    || cameras.find((device) => device.label)?.label || 'Default camera';
  const microphoneName = microphones.find((device) => device.deviceId === selectedMicrophoneId)?.label
    || microphones.find((device) => device.label)?.label || 'Default microphone';

  return (
    <section className={`${styles.connectionCard} ${requiredDevicesConnected ? styles.connectionCardReady : ''}`} aria-labelledby="device-step-title">
      <div className={styles.connectionCardTitle}>
        <span className={styles.connectionIcon}><StudioIcon name={mode === 'screen-only' ? 'mic' : 'camera'} /></span>
        <div><small>STEP 01</small><h3 id="device-step-title">{mode === 'screen-only' ? 'Audio' : 'Audio + Webcam'}</h3></div>
        <StatusDot ok={requiredDevicesConnected} />
      </div>
      <p className={styles.connectionDetail}>
        {requiredDevicesConnected
          ? mode === 'screen-only' ? microphoneName : `${microphoneName} · ${cameraName}`
          : mode === 'screen-only' ? 'Connect your microphone first.' : 'Connect your microphone and camera first.'}
      </p>
      <div className={styles.connectionChips} aria-live="polite">
        <span>Microphone: {mediaStatuses.microphone}</span>
        {mode !== 'screen-only' && <span>Camera: {mediaStatuses.camera}</span>}
      </div>
      <button
        className={`${styles.connectPrimary} ${studio.session === 'setup' ? styles.connectPrimarySetup : ''} ${requiredDevicesConnected ? styles.connectPrimaryConnected : ''} ${studio.session === 'setup' && !requiredDevicesConnected && !isConnectingSources ? styles.nextStepPulse : ''}`}
        type="button"
        onClick={() => void connectSources()}
        disabled={isConnectingSources || isConnectingSlideSource || studio.session !== 'setup'}
      >
        <StudioIcon name="camera" />
        {isConnectingSources
          ? 'Requesting access…'
          : `${requiredDevicesConnected ? 'Update' : 'Connect'} ${mode === 'screen-only' ? 'Audio' : 'Audio + Webcam'}`}
      </button>
      {studio.session !== 'processing' && (
        <AudioMeterPanel
          minimal
          state={audioState}
          onResume={() => void resumeAudio()}
          microphone={{ level: microphoneLevel, levelDb: microphoneLevelDb, available: Boolean(microphoneStream) }}
        />
      )}
    </section>
  );
}

function SlidesConnectionStep({ studio, slidesReady }: SourcesSectionProps & { slidesReady: boolean }) {
  const {
    requiredDevicesConnected, screenStream, hasSystemAudio, tabCapture,
    isConnectingSources, isConnectingSlideSource, connectSlideSource,
  } = studio;

  return (
    <section className={`${styles.connectionCard} ${slidesReady ? styles.connectionCardReady : ''}`} aria-labelledby="slides-step-title">
      <div className={styles.connectionCardTitle}>
        <span className={`${styles.connectionIcon} ${styles.slidesIcon}`}><StudioIcon name="screen" /></span>
        <div><small>STEP 02</small><h3 id="slides-step-title">Google Slides</h3></div>
        <StatusDot ok={slidesReady} />
      </div>
      <p className={styles.connectionDetail}>
        {slidesReady && tabCapture.target
          ? `Verified tab: ${tabCapture.target.title}`
          : 'Choose the open Google Slides tab in Chrome’s share picker.'}
      </p>
      {screenStream && <p className={styles.connectionDetail}>{hasSystemAudio ? 'Tab audio shared' : 'Tab audio not shared'}</p>}
      <button
        className={`${styles.connectSecondary} ${studio.session === 'setup' && requiredDevicesConnected && !slidesReady && tabCapture.available && !isConnectingSources && !isConnectingSlideSource ? styles.nextStepPulse : ''}`}
        type="button"
        onClick={() => void connectSlideSource()}
        disabled={!requiredDevicesConnected || !tabCapture.available || isConnectingSources || isConnectingSlideSource || studio.session !== 'setup'}
        title={!requiredDevicesConnected ? 'Complete step 1 first' : !tabCapture.available ? 'RecordWeb extension is required' : undefined}
      >
        <StudioIcon name="screen" />
        {isConnectingSlideSource
          ? tabCapture.status === 'connecting' ? 'Verifying shared tab…' : 'Opening share picker…'
          : slidesReady ? 'Change Google Slides tab' : 'Connect Google Slides'}
      </button>
      {!requiredDevicesConnected && <p className={styles.connectionHint}>Complete step 1 to unlock this action.</p>}
      {!tabCapture.available && <p className={styles.sourceWarning}>Install or enable the RecordWeb extension, then reload this page.</p>}
      {studio.session === 'setup' && !slidesReady && tabCapture.status === 'error' && (
        <p className={styles.connectionHint}>
          If the RecordWeb extension is already installed but Verification fails, reload the Google Slides tab, then try connecting again. The tab may have been put to sleep.
        </p>
      )}
      {requiredDevicesConnected && !slidesReady && tabCapture.available && (
        <p className={styles.connectionHint} role="status">{tabCapture.message}</p>
      )}
    </section>
  );
}

function SourceSettings({ studio }: SourcesSectionProps) {
  const {
    mode, setMode, effectsTab, setEffectsTab,
    selectedCameraId, setSelectedCameraId, selectedMicrophoneId, setSelectedMicrophoneId,
    cameras, microphones,
    tabCapture, legacyCursorTrajectory, sourcesConnected, stopAllMedia,
  } = studio;

  return (
    <details className={styles.setupDetails}>
      <summary>Manage sources &amp; output</summary>
      <div className={styles.setupDetailsBody}>
        <span className={styles.fieldLabel}>Capture mode</span>
        <div className={styles.modeList}>
          {modes.map((item) => (
            <button
              key={item.value}
              type="button"
              className={`${styles.modeButton} ${mode === item.value ? styles.modeButtonActive : ''}`}
              onClick={() => {
                setMode(item.value);
                if (item.value === 'screen-only' && effectsTab === 'camera') setEffectsTab('audio');
              }}
              aria-pressed={mode === item.value}
              disabled={studio.session !== 'setup'}
            >
              <span className={styles.modeIcon}><StudioIcon name={item.value === 'webcam-only' ? 'camera' : 'screen'} /></span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span className={styles.radioMark} />
            </button>
          ))}
        </div>
        <label className={styles.fieldLabel}>
          Camera
          <select value={selectedCameraId} onChange={(event) => setSelectedCameraId(event.target.value)} disabled={studio.session !== 'setup'}>
            <option value="">Default camera</option>
            {cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
          </select>
        </label>
        <label className={styles.fieldLabel}>
          Microphone
          <select value={selectedMicrophoneId} onChange={(event) => setSelectedMicrophoneId(event.target.value)} disabled={studio.session !== 'setup'}>
            <option value="">Default microphone</option>
            {microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
          </select>
        </label>
        <div className={styles.outputMeta}><span>30 FPS</span><span>16:9</span><span>30 min max</span></div>
        {!tabCapture.available && legacyCursorTrajectory.available && (
          <label className={styles.fieldLabel}>
            Legacy cursor display
            <select value={legacyCursorTrajectory.selectedDisplayId} onChange={(event) => legacyCursorTrajectory.setSelectedDisplayId(event.target.value)}>
              {legacyCursorTrajectory.displays.map((display) => <option key={display.id} value={display.id}>{display.label}{display.primary ? ' (Primary)' : ''}</option>)}
            </select>
          </label>
        )}
        {sourcesConnected && <button className={styles.disconnectButton} type="button" onClick={stopAllMedia}>Disconnect all sources</button>}
      </div>
    </details>
  );
}

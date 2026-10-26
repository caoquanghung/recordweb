import { modes } from './studioConfig';
import { StatusDot, StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioShell.module.css';

export function StudioSourcesPanel({ studio }: { studio: StudioController }) {
  const {
    mode, setMode, effectsTab, setEffectsTab,
    selectedCameraId, setSelectedCameraId, selectedMicrophoneId, setSelectedMicrophoneId,
    cameras, microphones, isConnectingSources, isConnectingSlideSource,
    sourcesConnected, requiredDevicesConnected, connectSources, connectSlideSource,
    stopAllMedia, mediaStatuses, screenStream, hasSystemAudio, tabCapture,
    legacyCursorTrajectory, mediaError, resolution, setResolution,
  } = studio;
  const needsSlides = mode !== 'webcam-only';
  const slidesReady = Boolean(
    screenStream?.getVideoTracks().some((track) => track.readyState === 'live') && tabCapture.connected,
  );
  const allReady = studio.recordingReady;
  const cameraName = cameras.find((device) => device.deviceId === selectedCameraId)?.label
    || cameras.find((device) => device.label)?.label || 'Default camera';
  const microphoneName = microphones.find((device) => device.deviceId === selectedMicrophoneId)?.label
    || microphones.find((device) => device.label)?.label || 'Default microphone';

  return (
    <aside className={`${styles.leftPanel} ${styles.setupInspector}`} aria-label="Sources and inputs">
      <header className={styles.inspectorHeader}>
        <div><StudioIcon name="screen" /><h2>Sources &amp; Inputs</h2></div>
        <span className={allReady ? styles.inspectorReady : styles.inspectorPending} role="status">
          {allReady ? 'Ready' : 'Setup'}
        </span>
      </header>

      <div className={styles.inspectorBody}>
        <div className={styles.inspectorKicker}>
          <span>RECORDING SETUP</span>
          <strong>{Number(requiredDevicesConnected) + Number(needsSlides && slidesReady)} / {needsSlides ? 2 : 1} ready</strong>
        </div>

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
            className={styles.connectPrimary}
            type="button"
            onClick={() => void connectSources()}
            disabled={isConnectingSources || isConnectingSlideSource || studio.session !== 'setup'}
          >
            <StudioIcon name="camera" />
            {isConnectingSources
              ? 'Requesting access…'
              : `${requiredDevicesConnected ? 'Update' : 'Connect'} ${mode === 'screen-only' ? 'Audio' : 'Audio + Webcam'}`}
          </button>
        </section>

        {needsSlides && (
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
              className={styles.connectSecondary}
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
            {requiredDevicesConnected && !slidesReady && tabCapture.available && (
              <p className={styles.connectionHint} role="status">{tabCapture.message}</p>
            )}
          </section>
        )}

        <div className={styles.inspectorTip}>
          <StudioIcon name="shield" />
          <p>{allReady ? 'Ready. You can start recording from the control below the preview.' : 'Your sources stay on this device until you choose to upload a recording.'}</p>
        </div>

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
            <span className={styles.fieldLabel}>Output resolution</span>
            <div className={styles.segmented}>
              {['1280x720', '1920x1080'].map((value) => (
                <button key={value} type="button" onClick={() => setResolution(value)} className={resolution === value ? styles.segmentActive : ''} disabled={studio.session !== 'setup'}>
                  {value === '1920x1080' ? '1080p' : '720p'}
                </button>
              ))}
            </div>
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
        {mediaError && <p className={styles.sourceError} role="alert">{mediaError.message}</p>}
      </div>

      <footer className={styles.inspectorFooter}><StudioIcon name="check" /> {mode === 'screen-only' ? 'Screen only' : 'Original camera'} · {resolution === '1920x1080' ? '1080p' : '720p'} at 30 FPS</footer>
    </aside>
  );
}

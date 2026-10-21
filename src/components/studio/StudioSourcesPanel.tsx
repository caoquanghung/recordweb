import { modes } from './studioConfig';
import { StatusDot, StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioShell.module.css';

export function StudioSourcesPanel({ studio }: { studio: StudioController }) {
  const {
    mode,
    setMode,
    effectsTab,
    setEffectsTab,
    selectedCameraId,
    setSelectedCameraId,
    selectedMicrophoneId,
    setSelectedMicrophoneId,
    cameras,
    microphones,
    isConnectingSources,
    isConnectingSlideSource,
    sourcesConnected,
    requiredDevicesConnected,
    connectSources,
    connectSlideSource,
    stopAllMedia,
    mediaStatuses,
    screenStream,
    hasSystemAudio,
    tabCapture,
    legacyCursorTrajectory,
    mediaError,
    resolution,
    setResolution,
  } = studio;

  return (
    <aside className={styles.leftPanel}>
      <section className={styles.panelSection}>
        <div className={styles.sectionHeading}>
          <div><span>01</span><h2>Capture mode</h2></div>
          <span className={styles.readyLabel}>Ready</span>
        </div>
        <div className={styles.modeList}>
          {modes.map((item) => (
            <button
              key={item.value}
              className={`${styles.modeButton} ${mode === item.value ? styles.modeButtonActive : ''}`}
              onClick={() => {
                setMode(item.value);
                if (item.value === 'screen-only' && effectsTab === 'camera') setEffectsTab('audio');
              }}
              aria-pressed={mode === item.value}
            >
              <span className={styles.modeIcon}><StudioIcon name={item.value === 'webcam-only' ? 'camera' : 'screen'} /></span>
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
              <span className={styles.radioMark} />
            </button>
          ))}
        </div>
      </section>

      <section className={styles.panelSection}>
        <div className={styles.sectionHeading}>
          <div><span>02</span><h2>Sources</h2></div>
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
            {isConnectingSources
              ? 'Requesting device access…'
              : mode === 'screen-only'
                ? requiredDevicesConnected ? 'Update microphone' : 'Connect microphone'
                : requiredDevicesConnected ? 'Update camera & microphone' : 'Connect camera & microphone'}
          </button>
          {sourcesConnected && <button className={styles.sourceStopButton} type="button" onClick={stopAllMedia}>Disconnect all</button>}
        </div>
        <div className={styles.sourceStatus}>
          <StatusDot ok={requiredDevicesConnected} />
          <span>Camera {mediaStatuses.camera} · microphone {mediaStatuses.microphone}</span>
        </div>
        {mode !== 'webcam-only' && (
          <>
            <label className={styles.fieldLabel}>
              Google Slides URL
              <input
                className={styles.textInput}
                type="url"
                inputMode="url"
                placeholder="https://docs.google.com/presentation/d/…"
                value={tabCapture.googleSlidesUrl}
                onChange={(event) => tabCapture.setGoogleSlidesUrl(event.target.value)}
                disabled={tabCapture.connected || isConnectingSources || isConnectingSlideSource}
              />
            </label>
            <div className={styles.sourceActions}>
              <button
                className={styles.sourceButton}
                type="button"
                onClick={() => void connectSlideSource()}
                disabled={!requiredDevicesConnected || !tabCapture.available || isConnectingSources || isConnectingSlideSource}
              >
                {isConnectingSlideSource
                  ? tabCapture.status === 'opening' || tabCapture.status === 'connecting'
                    ? 'Preparing Google Slides…'
                    : 'Opening share picker…'
                  : screenStream
                    ? 'Update Google Slides source'
                    : 'Connect Google Slides'}
              </button>
            </div>
            {!requiredDevicesConnected && (
              <p className={styles.sourceWarning}>
                {mode === 'screen-only'
                  ? 'Connect the microphone before connecting Google Slides.'
                  : 'Connect the camera and microphone before connecting Google Slides.'}
              </p>
            )}
            {!tabCapture.available && (
              <p className={styles.sourceWarning}>
                The RecordWeb extension is required. Install or enable it, then reload this page.
              </p>
            )}
            {screenStream && <div className={styles.sourceStatus}><StatusDot ok /><span>Tab video connected · {hasSystemAudio ? 'system audio shared' : 'no system audio'}</span></div>}
            {tabCapture.connected && tabCapture.target && (
              <div className={styles.sourceStatus}>
                <StatusDot ok />
                <span>Cursor target: {tabCapture.target.title}</span>
              </div>
            )}
            {!tabCapture.available && legacyCursorTrajectory.available && (
              <label className={styles.fieldLabel}>
                Legacy cursor display
                <select value={legacyCursorTrajectory.selectedDisplayId} onChange={(event) => legacyCursorTrajectory.setSelectedDisplayId(event.target.value)}>
                  {legacyCursorTrajectory.displays.map((display) => (
                    <option key={display.id} value={display.id}>{display.label}{display.primary ? ' (Primary)' : ''}</option>
                  ))}
                </select>
              </label>
            )}
            <div className={styles.sourceStatus}>
              <StatusDot ok={tabCapture.connected || (!tabCapture.available && legacyCursorTrajectory.available)} />
              <span>{tabCapture.available ? tabCapture.message : legacyCursorTrajectory.message}</span>
            </div>
            {!screenStream && requiredDevicesConnected && (
              <p className={styles.sourceWarning}>
                Connect Google Slides will prepare the tab, then ask you to select it for a live preview.
              </p>
            )}
          </>
        )}
        {mediaError && <p className={styles.sourceError} role="alert">{mediaError.message}</p>}
      </section>

      <section className={styles.panelSection}>
        <div className={styles.sectionHeading}>
          <div><span>03</span><h2>Output</h2></div>
        </div>
        <div className={styles.segmented}>
          {['1280x720', '1920x1080'].map((value) => (
            <button key={value} onClick={() => setResolution(value)} className={resolution === value ? styles.segmentActive : ''}>
              {value === '1920x1080' ? '1080p' : '720p'}
            </button>
          ))}
        </div>
        <div className={styles.outputMeta}>
          <span>30 FPS</span><span>16:9</span><span>30 min max</span>
        </div>
      </section>
    </aside>
  );
}

import type { AudioFilterConfig, PipShape, PipSize } from '@/types/media';
import { audioModes, backgrounds } from './studioConfig';
import { StudioIcon } from './StudioPrimitives';
import type { StudioController } from './useStudioController';
import styles from './StudioShell.module.css';

export function StudioEffectsPanel({ studio }: { studio: StudioController }) {
  const {
    effectsTab,
    setEffectsTab,
    mode,
    background,
    setBackground,
    pipShape,
    setPipShape,
    pipPosition,
    setPipPosition,
    compositorRunning,
    compositorWarning,
    segmentationError,
    segmentationState,
    inferenceFps,
    pipSize,
    setPipSize,
    audioState,
    audioMode,
    setAudioMode,
    customAudioConfig,
    setCustomAudioConfig,
    micGain,
    setMicGain,
    hasSystemAudio,
    systemVolume,
    setSystemVolume,
    mixedAudioStream,
    audioError,
    presets,
    presetName,
    setPresetName,
    savePreset,
    presetMessage,
    applyPreset,
  } = studio;

  return (
    <aside className={styles.rightPanel}>
      <div className={styles.effectTabs} role="tablist" aria-label="Effect controls">
        {(['camera', 'audio', 'preset'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={effectsTab === tab}
            className={effectsTab === tab ? styles.effectTabActive : ''}
            onClick={() => setEffectsTab(tab)}
            disabled={tab === 'camera' && mode === 'screen-only'}
          >
            {tab}
          </button>
        ))}
      </div>

      {effectsTab === 'camera' && (
        <section className={styles.inspectorSection}>
          <div className={styles.inspectorTitle}><div><StudioIcon name="spark" /><h2>Camera style</h2></div><span>Live</span></div>
          <label className={styles.fieldLabel}>Background</label>
          <div className={styles.choiceGrid}>
            {backgrounds.map((item) => (
              <button key={item.value} className={background === item.value ? styles.choiceActive : ''} onClick={() => setBackground(item.value)}>
                <span className={`${styles.choicePreview} ${styles[`preview${item.value}`]}`} />
                {item.label}
              </button>
            ))}
          </div>
          <label className={styles.fieldLabel}>Frame</label>
          <div className={styles.segmented}>
            {(['circle', 'rounded', 'cutout'] as PipShape[]).map((shape) => (
              <button key={shape} onClick={() => setPipShape(shape)} className={pipShape === shape ? styles.segmentActive : ''}>{shape}</button>
            ))}
          </div>
          <label className={styles.fieldLabel}>Position</label>
          <div className={styles.positionGrid}>
            {([
              ['top-left', '↖'],
              ['top-right', '↗'],
              ['bottom-left', '↙'],
              ['bottom-right', '↘'],
            ] as const).map(([position, label]) => (
              <button
                key={position}
                onClick={() => setPipPosition(position)}
                className={pipPosition === position ? styles.positionActive : ''}
                aria-label={`Move camera to ${position.replace('-', ' ')}`}
                title={`Move camera to ${position.replace('-', ' ')}`}
              >
                {label}
              </button>
            ))}
          </div>
          {compositorRunning && <p className={styles.compositorHint}>Drag the camera on the canvas, or focus it and use arrow keys. Hold Shift for larger steps.</p>}
          {compositorWarning && <p className={styles.compositorWarning}>{compositorWarning}</p>}
          {background !== 'original' && (
            <p className={segmentationError ? styles.compositorWarning : styles.compositorHint}>
              AI background: {segmentationError ?? (segmentationState === 'running' ? `${inferenceFps || '—'} inference FPS` : segmentationState)}
            </p>
          )}
          <label className={styles.fieldLabel}>Size</label>
          <div className={styles.segmented}>
            {(['small', 'medium', 'large'] as PipSize[]).map((size) => (
              <button key={size} onClick={() => setPipSize(size)} className={pipSize === size ? styles.segmentActive : ''}>{size[0].toUpperCase()}</button>
            ))}
          </div>
        </section>
      )}

      {effectsTab === 'audio' && (
        <section className={styles.inspectorSection}>
          <div className={styles.inspectorTitle}><div><StudioIcon name="mic" /><h2>Voice</h2></div><span>{audioState === 'running' ? 'Live' : 'DSP'}</span></div>
          <div className={styles.audioModes}>
            {audioModes.map((item) => (
              <button key={item} onClick={() => setAudioMode(item)} className={audioMode === item ? styles.audioModeActive : ''}>
                <span>{item}</span>{audioMode === item && <StudioIcon name="check" />}
              </button>
            ))}
          </div>
          {audioMode === 'Custom' && (
            <div className={styles.filterToggles}>
              {([
                ['highPassEnabled', '80 Hz rumble cut'],
                ['vocalBoostEnabled', '2.8 kHz presence'],
                ['lowPassEnabled', '12 kHz hiss cut'],
                ['compressorEnabled', 'Compressor'],
                ['noiseGateEnabled', 'Noise gate'],
              ] as Array<[keyof AudioFilterConfig, string]>).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={Boolean(customAudioConfig[key])}
                    onChange={(event) => setCustomAudioConfig((current) => ({ ...current, [key]: event.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
          <div className={styles.audioControls}>
            <label>
              <span>Mic gain</span><small>{Math.round(micGain * 100)}%</small>
              <input type="range" min="0" max="2" step="0.05" value={micGain} onChange={(event) => setMicGain(Number(event.target.value))} />
            </label>
            <label>
              <span>System audio</span><small>{hasSystemAudio ? `${Math.round(systemVolume * 100)}%` : 'Unavailable'}</small>
              <input type="range" min="0" max="2" step="0.05" value={systemVolume} onChange={(event) => setSystemVolume(Number(event.target.value))} disabled={!hasSystemAudio} />
            </label>
          </div>
          {mixedAudioStream && <p className={styles.audioReady}>Mixed audio track ready for recording</p>}
          {audioError && <p className={styles.sourceError} role="alert">{audioError}</p>}
        </section>
      )}

      {effectsTab === 'preset' && (
        <section className={styles.inspectorSection}>
          <div className={styles.inspectorTitle}><div><StudioIcon name="cloud" /><h2>Preset test</h2></div><span>{presets.length}</span></div>
          <input className={styles.textInput} value={presetName} onChange={(event) => setPresetName(event.target.value)} aria-label="Preset name" />
          <button className={styles.savePresetButton} onClick={() => void savePreset()}>Save current setup</button>
          {presetMessage && <p className={styles.inlineMessage} aria-live="polite">{presetMessage}</p>}
          <div className={styles.presetList}>
            {presets.slice(0, 3).map((preset) => (
              <button key={preset.id} onClick={() => applyPreset(preset)}><span>{preset.preset_name}</span><small>Load</small></button>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

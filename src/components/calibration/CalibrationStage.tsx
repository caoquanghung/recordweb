'use client';

import type { ReactNode, RefObject } from 'react';
import { CALIBRATION_CELL_ORDER, calibrationCellKey } from '@/lib/calibration/policy';
import type { Cell } from '@/hooks/useCalibrationSession';
import styles from './CalibrationStage.module.css';

export interface StageCell {
  row: number;
  col: number;
  imageUrl?: string;
  kind: 'empty' | 'saved' | 'captured';
  dimmed?: boolean;
}

export interface StageChip {
  tone: 'ok' | 'warn' | 'info';
  text: string;
}

interface CalibrationStageProps {
  overlayRef: RefObject<HTMLCanvasElement | null>;
  cells: StageCell[];
  heading: string;
  hint: ReactNode;
  notice?: string | null;
  target: Cell | null;
  countdown: number | null;
  /** Short status shown at the top of the blue zone; null shows `zoneMessage` instead. */
  chip: StageChip | null;
  /** Cell picked on the main screen for a single-cell retake. */
  selected?: Cell | null;
  zoneMessage: string;
  onCellSelect?: (cell: Cell) => void;
  selectLabel?: string;
}

/** The 16:9 calibration stage: grid panel on the left, live cutout zone on the right. */
export function CalibrationStage({
  overlayRef, cells, heading, hint, notice, target, countdown, chip, selected, zoneMessage, onCellSelect, selectLabel,
}: CalibrationStageProps) {
  const byKey = new Map(cells.map((cell) => [calibrationCellKey(cell.row, cell.col), cell]));
  const holdStill = countdown !== null && countdown > 0 && countdown <= 2;

  return (
    <div className={styles.frame}>
      <div className={styles.top}><span className={styles.heading}>{heading}</span></div>

      <div className={styles.panel}>
        <div className={styles.grid} role="group" aria-label="Lưới 3×3 các ô cần chỉ tay">
          {CALIBRATION_CELL_ORDER.map(([row, col]) => {
            const cell = byKey.get(calibrationCellKey(row, col));
            const isTarget = target?.[0] === row && target?.[1] === col;
            const isSelected = !isTarget && selected?.[0] === row && selected?.[1] === col;
            const classes = [
              styles.cell,
              cell?.kind === 'captured' ? styles.captured : '',
              cell?.kind === 'saved' ? styles.saved : '',
              cell?.dimmed ? styles.dimmed : '',
              isTarget ? styles.target : '',
              isSelected ? styles.selected : '',
            ].join(' ');
            const content = (
              <>
                <span className={styles.cellLabel}>{row},{col}</span>
                {cell?.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL or Blob image, no optimizer needed
                  <img className={styles.cellImage} src={cell.imageUrl} alt={`Posture ô ${row},${col}`} />
                )}
                {cell?.kind === 'captured' && <span className={styles.badge}>Mới</span>}
                {isTarget && countdown !== null && countdown > 0 && (
                  <span className={styles.countdown}>
                    <span className={styles.countdownNumber}>{countdown}</span>
                    {holdStill && <span className={styles.countdownText}>Giữ yên</span>}
                  </span>
                )}
                {isTarget && countdown === 0 && <span className={styles.countdownText}>Đang chụp…</span>}
                {isTarget && countdown === null && <span className={styles.targetCoordinate}>{row},{col}</span>}
              </>
            );
            return onCellSelect
              ? (
                <button
                  key={`${row}-${col}`} type="button" className={classes}
                  aria-label={`${selectLabel ?? 'Chọn'} ô ${row},${col}`}
                  onClick={() => onCellSelect([row, col])}
                >
                  {content}
                </button>
              )
              : <div key={`${row}-${col}`} className={classes}>{content}</div>;
          })}
        </div>
      </div>

      <div className={styles.zone}>
        {chip && (
          <span className={`${styles.chip} ${chip.tone === 'ok' ? styles.chipOk : chip.tone === 'info' ? styles.chipInfo : ''}`} role="status">
            {chip.text}
          </span>
        )}
        {!chip && <p className={styles.zonePlaceholder}>{zoneMessage}</p>}
      </div>

      <canvas ref={overlayRef} className={styles.overlay} aria-hidden="true" />

      <div className={styles.footer}>
        <p className={styles.hint}>{hint}</p>
        {notice && <p className={styles.notice} role="alert">{notice}</p>}
      </div>

      <p className={styles.srOnly} aria-live="polite">
        {target && countdown !== null && countdown > 0 ? `Ô ${target[0]},${target[1]}: còn ${countdown} giây.` : ''}
      </p>
    </div>
  );
}

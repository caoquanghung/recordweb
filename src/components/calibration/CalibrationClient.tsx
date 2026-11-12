'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LibraryLayout } from '@/components/library/LibraryLayout';
import libraryStyles from '@/components/library/LibraryClient.module.css';
import { StudioLeaveWarning } from '@/components/studio/StudioLeaveWarning';
import { useCalibrationSession, type Cell } from '@/hooks/useCalibrationSession';
import { QUALITY_MESSAGES } from '@/lib/calibration/geometry';
import {
  CALIBRATION_CELL_COUNT,
  CALIBRATION_CELL_ORDER,
  CALIBRATION_COUNTDOWN_OPTIONS,
  calibrationCellKey,
} from '@/lib/calibration/policy';
import { CalibrationStage, type StageCell, type StageChip } from './CalibrationStage';
import styles from './CalibrationClient.module.css';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function ConfirmDialog({ title, children, confirmLabel, danger, onCancel, onConfirm }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className={styles.dialog} onCancel={onCancel} aria-labelledby="calibration-confirm-title">
      <form method="dialog" onSubmit={(event) => { event.preventDefault(); onConfirm(); }}>
        <h2 id="calibration-confirm-title">{title}</h2>
        <div>{children}</div>
        <div className={styles.dialogActions}>
          <button className={styles.button} type="button" onClick={onCancel} autoFocus>Huỷ</button>
          <button className={`${styles.button} ${danger ? styles.danger : styles.primary}`} type="submit">{confirmLabel}</button>
        </div>
      </form>
    </dialog>
  );
}

function ConsentPanel({ busy, error, onAccept }: { busy: boolean; error: string | null; onAccept: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <section className={styles.panel} aria-labelledby="calibration-consent-title">
      <h2 id="calibration-consent-title">Thông báo quyền riêng tư</h2>
      <p>Trang này chụp ảnh bạn đang đứng chỉ tay. Đây là dữ liệu cá nhân nhạy cảm, vì vậy hãy đọc kỹ trước khi bật camera.</p>
      <ul>
        <li><strong>Dữ liệu được lưu:</strong> tối đa 9 ảnh (từ đầu đến ít nhất qua hông, hoặc toàn thân nếu camera thấy) đã xoá nền, cùng toạ độ ô bạn đang chỉ tay vào. Hệ thống <strong>không</strong> lưu video hay âm thanh.</li>
        <li><strong>Mục đích:</strong> giúp hệ thống hiểu bạn đang chỉ vào đâu trên slide khi xử lý các video bài giảng của chính bạn (nghiên cứu HCI).</li>
        <li><strong>Nơi lưu và người truy cập:</strong> Vercel Blob và Neon; chỉ bạn và quản trị viên (developer) của dự án xem được.</li>
        <li><strong>Quyền xoá:</strong> bạn có thể bấm “Xoá thiết lập đã lưu” bất cứ lúc nào để xoá cả dữ liệu lẫn file ảnh.</li>
        <li><strong>Camera:</strong> chỉ bật sau khi bạn đồng ý và bấm “Bật camera”. Ảnh chỉ rời trình duyệt khi bạn bấm Lưu.</li>
      </ul>
      <label className={styles.consentCheck}>
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>Tôi đã đọc và đồng ý cho lưu ảnh thiết lập dáng chỉ tay của tôi theo các điều trên.</span>
      </label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.group}>
        <button className={`${styles.button} ${styles.primary}`} type="button" disabled={!agreed || busy} onClick={onAccept}>
          {busy ? 'Đang ghi nhận…' : 'Đồng ý và tiếp tục'}
        </button>
      </div>
    </section>
  );
}

function Explainer({ cameraReady, bodyOk, captured }: { cameraReady: boolean; bodyOk: boolean; captured: boolean }) {
  const steps = [
    { done: cameraReady, text: <>Bấm <strong>Bật camera</strong>.</> },
    { done: cameraReady && bodyOk, text: <>Đứng cách camera để thấy <strong>ít nhất từ đầu đến hông</strong> (thấy cả người cũng được).</> },
    { done: captured, text: <>Bấm <strong>Bắt đầu chụp</strong>, rồi chỉ tay vào ô được tô sáng khi đang đếm ngược.</> },
  ];
  return (
    <section className={styles.explainer} aria-labelledby="calibration-explainer-title">
      <h2 id="calibration-explainer-title">Thiết lập này dùng để làm gì?</h2>
      <p>Hệ thống chụp ảnh bạn khi chỉ tay vào từng phần của slide, để hiểu bạn đang chỉ vào đâu. Slide được chia thành lưới 9 ô (3×3).</p>
      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={index} className={`${styles.step} ${step.done ? styles.stepDone : ''}`}>
            <span className={styles.stepNumber} aria-hidden="true">{step.done ? '✓' : index + 1}</span>
            <span>{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function CalibrationClient() {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const session = useCalibrationSession(overlayRef, workspaceRef);
  const { profile, camera, pose, step, active } = session;
  const [confirm, setConfirm] = useState<'delete' | 'discard' | null>(null);

  const postures = profile?.postures;
  const cells = useMemo<StageCell[]>(() => CALIBRATION_CELL_ORDER.map(([row, col]) => {
    const stored = postures ?? [];
    const key = calibrationCellKey(row, col);
    const capture = session.captures[key];
    const saved = stored.find((posture) => posture.cellRow === row && posture.cellCol === col);
    if (active && capture) return { row, col, imageUrl: capture.url, kind: 'captured' as const };
    if (active && session.saveMode === 'replace-all') return { row, col, kind: 'empty' as const };
    if (saved) return { row, col, imageUrl: saved.url, kind: 'saved' as const, dimmed: active };
    return { row, col, kind: 'empty' as const };
  }), [active, session.captures, session.saveMode, postures]);

  const completeness = profile?.completeness ?? 0;
  const capturedCount = Object.keys(session.captures).length;
  const cameraReady = camera.status === 'ready';
  const idle = step === 'idle';

  // Status chip / placeholder for the blue zone.
  let chip: StageChip | null = null;
  let zoneMessage = 'Bấm “Bật camera” để xem trước.';
  if (camera.status === 'starting') zoneMessage = 'Đang mở camera…';
  else if (camera.status === 'error') zoneMessage = 'Không mở được camera.';
  else if (cameraReady && step !== 'saving') {
    if (pose.modelState === 'error') chip = { tone: 'warn', text: 'Model không tải được' };
    else if (pose.modelState !== 'ready') chip = { tone: 'info', text: 'Đang tải model…' };
    else if (pose.live.ok) chip = { tone: 'ok', text: 'Đủ người trong khung' };
    else chip = { tone: 'warn', text: QUALITY_MESSAGES[pose.live.issues[0]] };
  }

  let heading = 'Thiết lập dáng chỉ tay';
  let hint: ReactNode = 'Bấm “Bật camera” để xem trước, rồi đứng cách camera để thấy ít nhất từ đầu đến hông.';
  let onCellSelect: ((cell: Cell) => void) | undefined;
  let selectLabel = 'Chọn';

  if (idle && cameraReady) {
    hint = completeness > 0
      ? 'Bấm vào một ô để chọn chụp lại riêng ô đó, hoặc “Thiết lập lại toàn bộ” để làm lại từ đầu.'
      : 'Khi đã sẵn sàng, bấm “Bắt đầu chụp”, rồi chỉ tay vào ô được tô sáng khi đang đếm ngược.';
  } else if (step === 'capturing' && session.activeCell) {
    const [row, col] = session.activeCell;
    const index = session.queue.findIndex(([r, c]) => r === row && c === col);
    heading = session.queue.length > 1 && index >= 0
      ? `Ô ${index + 1}/${session.queue.length}: chỉ tay vào ô ${row},${col}`
      : `Chỉ tay vào ô ${row},${col}`;
    hint = 'Giữ nguyên tư thế đến khi ảnh được chụp.';
  } else if (step === 'review' || step === 'saving') {
    heading = `Xem lại (${capturedCount} ảnh mới)`;
    hint = step === 'saving'
      ? 'Đang lưu, vui lòng giữ nguyên trang này.'
      : 'Bấm vào một ô để chụp lại. Khi hài lòng, bấm “Lưu thiết lập”.';
    if (step === 'review') { onCellSelect = session.retake; selectLabel = 'Chụp lại'; }
  }
  if (idle) {
    onCellSelect = (cell) => session.selectCell(
      session.selectedCell && session.selectedCell[0] === cell[0] && session.selectedCell[1] === cell[1] ? null : cell,
    );
  }

  const target: Cell | null = step === 'capturing' ? session.activeCell : null;
  const selected = idle ? session.selectedCell : null;
  const loadingMessage = camera.status === 'starting' ? 'Đang mở camera…'
    : cameraReady && pose.modelState === 'loading' ? 'Đang tải model nhận diện (lần đầu có thể mất vài giây)…' : null;

  return (
    <LibraryLayout
      activeHref="/calibration"
      eyebrow="Thiết lập"
      countLabel={`${completeness}/${CALIBRATION_CELL_COUNT} ô đã lưu`}
      title="Thiết lập dáng chỉ tay"
      description="Chụp 9 ảnh khi bạn chỉ tay vào từng phần của slide, để hệ thống hiểu bạn đang chỉ vào đâu khi xử lý video bài giảng."
      summary={profile && completeness > 0 && idle ? (
        <button className={libraryStyles.syncButton} type="button" disabled={session.busy} onClick={() => setConfirm('delete')}>
          Xoá thiết lập đã lưu
        </button>
      ) : <div />}
      overlay={<>
        <StudioLeaveWarning reason={session.leaveWarning} />
        {confirm === 'delete' && (
          <ConfirmDialog
            title="Xoá thiết lập đã lưu?" confirmLabel="Xoá vĩnh viễn" danger
            onCancel={() => setConfirm(null)}
            onConfirm={() => { setConfirm(null); void session.removeProfile(); }}
          >
            <p>Toàn bộ ảnh thiết lập dáng chỉ tay và dữ liệu liên quan sẽ bị xoá khỏi hệ thống, kể cả file trên Vercel Blob. Thao tác không thể hoàn tác.</p>
          </ConfirmDialog>
        )}
        {confirm === 'discard' && (
          <ConfirmDialog
            title="Thoát mà không lưu?" confirmLabel="Thoát, bỏ ảnh" danger
            onCancel={() => setConfirm(null)}
            onConfirm={() => { setConfirm(null); session.exitSession(); }}
          >
            <p>{capturedCount} ảnh vừa chụp chưa được lưu và sẽ bị mất. Camera cũng sẽ được tắt.</p>
          </ConfirmDialog>
        )}
      </>}
    >
      <div className={styles.body}>
        {session.status && <p className={styles.status} role="status">{session.status}</p>}

        {session.loadState === 'loading' && <div className={libraryStyles.empty} aria-busy="true">Đang tải thiết lập đã lưu…</div>}

        {session.loadState === 'error' && (
          <div className={libraryStyles.empty}>
            <strong>Không tải được dữ liệu</strong>
            <span>{session.loadError}</span>
            <button className={`${styles.button} ${styles.primary}`} type="button" onClick={session.retryLoad}>Thử lại</button>
          </div>
        )}

        {session.needsConsent && (
          <ConsentPanel busy={session.consentBusy} error={session.consentError} onAccept={() => void session.acceptConsent()} />
        )}

        {session.loadState === 'ready' && !session.needsConsent && (
          <div ref={workspaceRef} className={styles.workspace}>
            {step !== 'capturing' && (
              <Explainer
                cameraReady={cameraReady}
                bodyOk={pose.modelState === 'ready' && pose.live.ok}
                captured={capturedCount > 0}
              />
            )}

            <CalibrationStage
              overlayRef={overlayRef}
              cells={cells}
              heading={heading}
              hint={hint}
              notice={session.notice ?? session.fullscreenWarning}
              target={target}
              countdown={session.countdown}
              chip={chip}
              selected={selected}
              zoneMessage={zoneMessage}
              onCellSelect={step === 'saving' ? undefined : onCellSelect}
              selectLabel={selectLabel}
            />

            <div className={styles.controls}>
              {idle && (
                <>
                  <div className={styles.group}>
                    {session.cameraRunning
                      ? <button className={styles.button} type="button" onClick={session.disableCamera}>Tắt camera</button>
                      : <button className={`${styles.button} ${styles.primary}`} type="button" onClick={session.enableCamera}>Bật camera</button>}
                  </div>
                  {cameraReady && (
                    <div className={styles.group}>
                      <span className={styles.label}>Đếm ngược</span>
                      <div className={styles.segments} role="group" aria-label="Thời gian đếm ngược">
                        {CALIBRATION_COUNTDOWN_OPTIONS.map((value) => (
                          <button
                            key={value} type="button" aria-pressed={session.seconds === value}
                            className={`${styles.segment} ${session.seconds === value ? styles.segmentActive : ''}`}
                            onClick={() => session.setSeconds(value)}
                          >{value}s</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {cameraReady && camera.devices.length > 1 && (
                    <div className={styles.group}>
                      <label className={styles.label} htmlFor="calibration-camera">Camera</label>
                      <select
                        id="calibration-camera" className={styles.select} value={camera.deviceId}
                        onChange={(event) => void camera.start(event.target.value)}
                      >
                        {camera.devices.map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <span className={styles.spacer} />
                  {loadingMessage && <span className={styles.meta} role="status">{loadingMessage}</span>}
                  {!session.cameraRunning && <span className={styles.meta}>Hãy bật camera trước khi chụp.</span>}
                  {pose.modelState === 'error' && (
                    <button className={styles.button} type="button" onClick={pose.retryModel}>Tải lại model</button>
                  )}
                  {profile && completeness > 0 && !loadingMessage && session.cameraRunning && (
                    <span className={styles.meta}>
                      {completeness}/{CALIBRATION_CELL_COUNT} ô · cập nhật {formatDate(profile.updatedAt)}
                      {completeness < CALIBRATION_CELL_COUNT ? ' · chưa đủ 9 ô' : ''}
                    </span>
                  )}
                  {session.selectedCell && (
                    <button className={styles.button} type="button" disabled={!session.canBegin} onClick={session.startRetakeSelected}>
                      Chụp lại ô {session.selectedCell[0]},{session.selectedCell[1]}
                    </button>
                  )}
                  <button className={`${styles.button} ${styles.primary}`} type="button" disabled={!session.canBegin} onClick={session.startFull}>
                    {completeness > 0 ? 'Thiết lập lại toàn bộ' : 'Bắt đầu chụp'}
                  </button>
                </>
              )}

              {step === 'capturing' && (
                <>
                  <span className={styles.meta}>
                    {session.queue.length > 1 && session.activeCell
                      ? `Ô ${session.queue.findIndex(([r, c]) => r === session.activeCell![0] && c === session.activeCell![1]) + 1}/${session.queue.length}. `
                      : ''}
                    Nếu chưa thấy đủ người, ô hiện tại sẽ được đếm lại.
                  </span>
                  <span className={styles.spacer} />
                  <button className={styles.button} type="button" onClick={session.cancelCapture}>Huỷ chụp</button>
                </>
              )}

              {step === 'review' && (
                <>
                  <span className={styles.meta}>
                    {session.saveMode === 'replace-all'
                      ? `Lưu sẽ thay toàn bộ thiết lập hiện tại.${capturedCount < CALIBRATION_CELL_COUNT ? ` Mới có ${capturedCount}/9 ô; các ô thiếu sẽ bị xoá khỏi thiết lập.` : ''}`
                      : 'Lưu chỉ thay các ô vừa chụp lại; các ô còn lại được giữ nguyên.'}
                  </span>
                  <span className={styles.spacer} />
                  <button className={styles.button} type="button" onClick={capturedCount ? () => setConfirm('discard') : session.exitSession}>Thoát không lưu</button>
                  <button className={`${styles.button} ${styles.primary}`} type="button" disabled={!capturedCount} onClick={() => void session.save()}>
                    Lưu thiết lập ({capturedCount} ô)
                  </button>
                </>
              )}

              {step === 'saving' && (
                <>
                  <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={session.saveProgress?.total ?? 1} aria-valuenow={session.saveProgress?.done ?? 0}>
                    <span style={{ width: `${session.saveProgress ? (session.saveProgress.done / session.saveProgress.total) * 100 : 0}%` }} />
                  </div>
                  <span className={styles.meta} role="status">Đang lưu {session.saveProgress?.done ?? 0}/{session.saveProgress?.total ?? 0} ảnh…</span>
                  <span className={styles.spacer} />
                  <button className={styles.button} type="button" onClick={session.cancelSave}>Huỷ lưu</button>
                </>
              )}
            </div>

            {camera.error && <p className={styles.error} role="alert">{camera.error}</p>}
            {pose.modelError && <p className={styles.error} role="alert">{pose.modelError}</p>}
            {session.saveError && <p className={styles.error} role="alert">{session.saveError}</p>}
          </div>
        )}
      </div>
    </LibraryLayout>
  );
}

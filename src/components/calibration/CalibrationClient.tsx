'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LibraryLayout } from '@/components/library/LibraryLayout';
import libraryStyles from '@/components/library/LibraryClient.module.css';
import { StudioLeaveWarning } from '@/components/studio/StudioLeaveWarning';
import { useCalibrationSession, type Cell } from '@/hooks/useCalibrationSession';
import {
  CALIBRATION_CELL_COUNT,
  CALIBRATION_CELL_ORDER,
  CALIBRATION_COUNTDOWN_OPTIONS,
  calibrationCellKey,
} from '@/lib/calibration/policy';
import { CalibrationStage, type StageCell } from './CalibrationStage';
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
      <p>Trang này chụp ảnh toàn thân của bạn. Đây là dữ liệu cá nhân nhạy cảm, vì vậy hãy đọc kỹ trước khi bật camera.</p>
      <ul>
        <li><strong>Dữ liệu được lưu:</strong> 9 ảnh toàn thân đã xoá nền cùng toạ độ ô bạn đang chỉ tay vào. Hệ thống <strong>không</strong> lưu video hay âm thanh.</li>
        <li><strong>Mục đích:</strong> hiệu chỉnh các video bài giảng của chính bạn (nghiên cứu HCI).</li>
        <li><strong>Nơi lưu và người truy cập:</strong> Vercel Blob và Neon; chỉ bạn và quản trị viên (developer) của dự án xem được.</li>
        <li><strong>Quyền xoá:</strong> bạn có thể bấm “Xoá toàn bộ profile” bất cứ lúc nào để xoá cả dữ liệu lẫn file ảnh.</li>
        <li><strong>Camera:</strong> chỉ bật sau khi bạn đồng ý. Ảnh chỉ rời trình duyệt khi bạn bấm Lưu.</li>
      </ul>
      <label className={styles.consentCheck}>
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>Tôi đã đọc và đồng ý cho lưu ảnh calibration của tôi theo các điều trên.</span>
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

export function CalibrationClient() {
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const session = useCalibrationSession(overlayRef);
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
  const cameraOn = active && camera.status === 'ready';
  const quality = cameraOn && pose.modelState === 'ready' && step !== 'saving' ? pose.live : null;

  let heading = 'Hiệu chỉnh dáng đứng';
  let hint: ReactNode = 'Bấm “Bắt đầu calibrate” để chụp 9 tư thế chỉ tay vào từng ô của lưới.';
  let zoneMessage = 'Ảnh webcam của bạn sẽ hiện ở đây khi bắt đầu.';
  let onCellSelect: ((cell: Cell) => void) | undefined;
  const selectLabel = 'Chụp lại';

  if (!active && completeness > 0) {
    hint = 'Bấm vào một ô trong lưới để chụp lại riêng ô đó, hoặc “Chụp lại toàn bộ” để làm lại từ đầu.';
    onCellSelect = session.startRetake;
  } else if (active && step === 'ready') {
    heading = session.queue.length === 1
      ? `Chụp lại ô ${session.queue[0][0]},${session.queue[0][1]}`
      : 'Chuẩn bị chụp 9 tư thế';
    hint = 'Đứng cách camera để thấy cả đầu và chân. Khi đã sẵn sàng, bấm “Bắt đầu chụp” rồi chỉ tay vào ô được tô sáng.';
    zoneMessage = camera.status === 'starting' ? 'Đang mở camera…' : 'Đang chờ camera và model.';
  } else if (active && step === 'capturing' && session.activeCell) {
    const [row, col] = session.activeCell;
    const index = session.queue.findIndex(([r, c]) => r === row && c === col);
    heading = session.queue.length > 1 && index >= 0
      ? `Ô ${index + 1}/${session.queue.length}: chỉ tay vào ô ${row},${col}`
      : `Chỉ tay vào ô ${row},${col}`;
    hint = 'Giữ nguyên tư thế đến khi ảnh được chụp.';
  } else if (active && (step === 'review' || step === 'saving')) {
    heading = `Xem lại (${capturedCount} ảnh mới)`;
    hint = step === 'saving'
      ? 'Đang lưu, vui lòng giữ nguyên trang này.'
      : 'Bấm vào một ô để chụp lại. Khi hài lòng, bấm Lưu.';
    if (step === 'review') onCellSelect = session.retake;
  }

  const target: Cell | null = step === 'capturing' ? session.activeCell
    : active && step === 'ready' && session.queue.length === 1 ? session.queue[0] : null;

  const modelBusy = pose.modelState === 'loading';
  const startDisabled = !session.canBegin;
  const loadingMessage = camera.status === 'starting' ? 'Đang mở camera…'
    : modelBusy ? 'Đang tải model nhận diện dáng người (lần đầu có thể mất vài giây)…' : null;

  return (
    <LibraryLayout
      activeHref="/calibration"
      eyebrow="Calibration"
      countLabel={`${completeness}/${CALIBRATION_CELL_COUNT} ô`}
      title="Hiệu chỉnh dáng đứng"
      description="Chụp 9 tư thế chỉ tay vào từng ô của lưới 3×3 để hiệu chỉnh các video bài giảng đã quay."
      summary={profile && completeness > 0 && !active ? (
        <button className={libraryStyles.syncButton} type="button" disabled={session.busy} onClick={() => setConfirm('delete')}>
          Xoá toàn bộ profile
        </button>
      ) : <div />}
      overlay={<>
        <StudioLeaveWarning reason={session.leaveWarning} />
        {confirm === 'delete' && (
          <ConfirmDialog
            title="Xoá toàn bộ profile?" confirmLabel="Xoá vĩnh viễn" danger
            onCancel={() => setConfirm(null)}
            onConfirm={() => { setConfirm(null); void session.removeProfile(); }}
          >
            <p>Toàn bộ ảnh calibration và dữ liệu liên quan sẽ bị xoá khỏi hệ thống, kể cả file trên Vercel Blob. Thao tác không thể hoàn tác.</p>
          </ConfirmDialog>
        )}
        {confirm === 'discard' && (
          <ConfirmDialog
            title="Thoát mà không lưu?" confirmLabel="Thoát, bỏ ảnh" danger
            onCancel={() => setConfirm(null)}
            onConfirm={() => { setConfirm(null); session.exitSession(); }}
          >
            <p>{capturedCount} ảnh vừa chụp chưa được lưu và sẽ bị mất.</p>
          </ConfirmDialog>
        )}
      </>}
    >
      <div className={styles.body}>
        {session.status && <p className={styles.status} role="status">{session.status}</p>}

        {session.loadState === 'loading' && <div className={libraryStyles.empty} aria-busy="true">Đang tải profile calibration…</div>}

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
          <>
            <CalibrationStage
              overlayRef={overlayRef}
              cells={cells}
              heading={heading}
              hint={hint}
              notice={session.notice}
              target={target}
              countdown={session.countdown}
              quality={quality}
              zoneMessage={zoneMessage}
              onCellSelect={step === 'saving' ? undefined : onCellSelect}
              selectLabel={selectLabel}
            />

            <div className={styles.controls}>
              {!active && (
                <>
                  <button className={`${styles.button} ${styles.primary}`} type="button" onClick={session.startFull}>
                    {completeness > 0 ? 'Chụp lại toàn bộ' : 'Bắt đầu calibrate'}
                  </button>
                  <span className={styles.meta}>
                    {profile && completeness > 0
                      ? `${completeness}/${CALIBRATION_CELL_COUNT} ô · cập nhật ${formatDate(profile.updatedAt)}${completeness < CALIBRATION_CELL_COUNT ? ' · chưa đủ 9 ô' : ''}`
                      : 'Chưa có ảnh calibration nào.'}
                  </span>
                </>
              )}

              {active && step === 'ready' && (
                <>
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
                  {camera.devices.length > 1 && (
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
                  {camera.status === 'error' && (
                    <button className={styles.button} type="button" onClick={() => void camera.start()}>Thử lại camera</button>
                  )}
                  {pose.modelState === 'error' && (
                    <button className={styles.button} type="button" onClick={pose.retryModel}>Tải lại model</button>
                  )}
                  <button className={styles.button} type="button" onClick={capturedCount ? () => setConfirm('discard') : session.exitSession}>Thoát</button>
                  <button className={`${styles.button} ${styles.primary}`} type="button" disabled={startDisabled} onClick={session.begin}>Bắt đầu chụp</button>
                </>
              )}

              {active && step === 'capturing' && (
                <>
                  <span className={styles.meta}>Đang chụp. Nếu chưa thấy cả đầu và chân, ô hiện tại sẽ được đếm lại.</span>
                  <span className={styles.spacer} />
                  <button className={styles.button} type="button" onClick={session.cancelCapture}>Huỷ chụp</button>
                </>
              )}

              {active && step === 'review' && (
                <>
                  <span className={styles.meta}>
                    {session.saveMode === 'replace-all'
                      ? `Lưu sẽ thay toàn bộ profile hiện tại.${capturedCount < CALIBRATION_CELL_COUNT ? ` Mới có ${capturedCount}/9 ô; các ô thiếu sẽ bị xoá khỏi profile.` : ''}`
                      : 'Lưu chỉ thay các ô vừa chụp lại; các ô còn lại được giữ nguyên.'}
                  </span>
                  <span className={styles.spacer} />
                  <button className={styles.button} type="button" onClick={capturedCount ? () => setConfirm('discard') : session.exitSession}>Thoát không lưu</button>
                  <button className={`${styles.button} ${styles.primary}`} type="button" disabled={!capturedCount} onClick={() => void session.save()}>
                    Lưu {capturedCount} ô
                  </button>
                </>
              )}

              {active && step === 'saving' && (
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

            {active && camera.error && <p className={styles.error} role="alert">{camera.error}</p>}
            {active && pose.modelError && <p className={styles.error} role="alert">{pose.modelError}</p>}
            {session.saveError && <p className={styles.error} role="alert">{session.saveError}</p>}
          </>
        )}
      </div>
    </LibraryLayout>
  );
}

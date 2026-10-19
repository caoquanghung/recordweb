'use client';

import { useState } from 'react';
import {
  downloadRecordingArchive,
  type RecordingArchiveAsset,
} from '@/lib/recordingArchive';
import styles from './share.module.css';

interface Props {
  recordingTitle: string;
  assets: RecordingArchiveAsset[];
}

export function RecordingArchiveDownloadButton({ recordingTitle, assets }: Props) {
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setIsPreparing(true);
    setError('');
    try {
      await downloadRecordingArchive(recordingTitle, assets);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setIsPreparing(false);
    }
  };

  return (
    <div className={styles.archiveDownload}>
      <button type="button" onClick={() => void download()} disabled={isPreparing}>
        <strong>{isPreparing ? 'Preparing ZIP…' : 'Download all files'}</strong>
        <span>{assets.length} files · ZIP</span>
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}

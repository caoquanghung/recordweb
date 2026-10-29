import assert from 'node:assert/strict';
import test from 'node:test';
import { getRecordingLeaveWarning } from '../../src/components/studio/recordingLeaveWarning.ts';

const saved = { session: 'review', uploadState: 'ready', titleRequired: false, titleSaving: false };

test('warns throughout finalization, pre-upload review, upload, and metadata saving', () => {
  assert.match(getRecordingLeaveWarning({ ...saved, session: 'processing' }), /still being prepared/);
  for (const uploadState of ['idle', 'uploading', 'saving']) {
    assert.match(getRecordingLeaveWarning({ ...saved, uploadState }), /still being saved/);
  }
});

test('does not imply that a failed upload is safely backed up or automatically resumable', () => {
  assert.match(getRecordingLeaveWarning({ ...saved, uploadState: 'error' }), /recovery may be incomplete/);
  assert.match(getRecordingLeaveWarning({ ...saved, uploadState: 'error' }), /will not resume automatically/);
});

test('retains title protection through the asynchronous cloud/local save', () => {
  assert.match(getRecordingLeaveWarning({ ...saved, titleRequired: true }), /still needs a title/);
  assert.match(getRecordingLeaveWarning({ ...saved, titleSaving: true }), /local backup are still being saved/);
});

test('removes the warning when fully saved and does not warn during idle setup', () => {
  assert.equal(getRecordingLeaveWarning(saved), null);
  assert.equal(getRecordingLeaveWarning({ ...saved, session: 'setup', uploadState: 'idle' }), null);
});

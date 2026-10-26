import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecordingTitleError,
  MAX_RECORDING_TITLE_LENGTH,
  normalizeRecordingTitle,
} from '../../src/lib/recordingTitle.ts';

test('trims a valid recording title without changing its content', () => {
  assert.equal(normalizeRecordingTitle('  Applied Mathematics — Chapter 4  '), 'Applied Mathematics — Chapter 4');
  assert.equal(getRecordingTitleError('  Applied Mathematics — Chapter 4  '), null);
});

test('requires a non-empty recording title', () => {
  assert.equal(getRecordingTitleError('   '), 'Recording title is required.');
  assert.equal(getRecordingTitleError(undefined), 'Recording title is required.');
});

test('accepts 120 characters and rejects longer titles', () => {
  assert.equal(getRecordingTitleError('a'.repeat(MAX_RECORDING_TITLE_LENGTH)), null);
  assert.equal(
    getRecordingTitleError('a'.repeat(MAX_RECORDING_TITLE_LENGTH + 1)),
    `Recording title must be ${MAX_RECORDING_TITLE_LENGTH} characters or fewer.`,
  );
});

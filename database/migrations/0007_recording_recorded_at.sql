-- Preserve the actual session start time separately from the cloud metadata insert time.
ALTER TABLE recordings
    ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ;

UPDATE recordings
SET recorded_at = created_at
WHERE recorded_at IS NULL;

ALTER TABLE recordings
    ALTER COLUMN recorded_at SET DEFAULT NOW(),
    ALTER COLUMN recorded_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recordings_user_recorded_at
    ON recordings(user_id, recorded_at DESC);

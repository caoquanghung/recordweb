-- Upgrade both a fresh database and the original unowned RecordWeb schema.
-- The migration runner wraps this file in a single transaction.

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(128) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128),
    title VARCHAR(255) NOT NULL,
    duration_seconds REAL NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    resolution VARCHAR(32) NOT NULL DEFAULT '1920x1080',
    fps INTEGER NOT NULL DEFAULT 30,
    mime_type VARCHAR(64) NOT NULL DEFAULT 'video/webm',
    local_id VARCHAR(128),
    storage_url TEXT,
    blob_pathname TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio_presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128),
    preset_name VARCHAR(100) NOT NULL,
    pip_shape VARCHAR(32) NOT NULL DEFAULT 'circle',
    pip_size VARCHAR(32) NOT NULL DEFAULT 'medium',
    pip_position VARCHAR(32) NOT NULL DEFAULT 'bottom-right',
    bg_removal_mode VARCHAR(32) NOT NULL DEFAULT 'blur',
    filters_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE recordings
    ADD COLUMN IF NOT EXISTS user_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS blob_pathname TEXT,
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE studio_presets
    ADD COLUMN IF NOT EXISTS user_id VARCHAR(128);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM recordings WHERE user_id IS NULL) THEN
        RAISE EXCEPTION
            'Cannot require recordings.user_id while legacy rows are unowned. Assign each row to a valid users.id, then rerun the migration.';
    END IF;

    IF EXISTS (SELECT 1 FROM studio_presets WHERE user_id IS NULL) THEN
        RAISE EXCEPTION
            'Cannot require studio_presets.user_id while legacy rows are unowned. Assign each row to a valid users.id, then rerun the migration.';
    END IF;
END
$$;

ALTER TABLE recordings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE studio_presets ALTER COLUMN user_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recordings_user_id_fkey'
          AND conrelid = 'recordings'::regclass
    ) THEN
        ALTER TABLE recordings
            ADD CONSTRAINT recordings_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'studio_presets_user_id_fkey'
          AND conrelid = 'studio_presets'::regclass
    ) THEN
        ALTER TABLE studio_presets
            ADD CONSTRAINT studio_presets_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_recordings_user_id
    ON recordings(user_id);

CREATE INDEX IF NOT EXISTS idx_recordings_created_at
    ON recordings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_presets_user_id
    ON studio_presets(user_id);

CREATE TABLE IF NOT EXISTS recording_shares (
    recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    recipient_user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(32) NOT NULL DEFAULT 'viewer'
        CHECK (permission IN ('viewer', 'viewer_download')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (recording_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_recording_shares_recipient
    ON recording_shares(recipient_user_id);

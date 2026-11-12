-- Teacher calibration profile: one profile per user holding up to nine posture
-- cutout images (one per cell of a 3x3 grid). Images live in Vercel Blob; only
-- metadata is stored here. See docs/note-note/calibration_profile.md.
CREATE TABLE calibration_profiles (
    user_id VARCHAR(128) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    consent_version TEXT NOT NULL,
    consent_accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE calibration_postures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(128) NOT NULL REFERENCES calibration_profiles(user_id) ON DELETE CASCADE,
    cell_row SMALLINT NOT NULL CHECK (cell_row BETWEEN 1 AND 3),
    cell_col SMALLINT NOT NULL CHECK (cell_col BETWEEN 1 AND 3),
    storage_url TEXT NOT NULL,
    blob_pathname TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type = 'image/png'),
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 8388608),
    width_px INTEGER NOT NULL CHECK (width_px BETWEEN 120 AND 4096),
    height_px INTEGER NOT NULL CHECK (height_px = 1080),
    source_width INTEGER NOT NULL CHECK (source_width > 0),
    source_height INTEGER NOT NULL CHECK (source_height > 0),
    source_bbox JSONB NOT NULL CHECK (jsonb_typeof(source_bbox) = 'object'),
    scale_factor NUMERIC(10, 6) NOT NULL CHECK (scale_factor > 0),
    mirrored BOOLEAN NOT NULL DEFAULT FALSE CHECK (mirrored = FALSE),
    pose_model TEXT NOT NULL,
    capture_session_id UUID NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, cell_row, cell_col)
);

-- Tracks every Blob pathname the server issued an upload token for, so images
-- that were replaced or never committed can be cleaned up opportunistically.
CREATE TABLE calibration_upload_ledger (
    blob_pathname TEXT PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'committed', 'replaced')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX calibration_upload_ledger_user_status_idx
    ON calibration_upload_ledger(user_id, status, created_at);

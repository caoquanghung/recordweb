CREATE TABLE IF NOT EXISTS recording_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recording_id UUID NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    kind VARCHAR(32) NOT NULL
        CHECK (kind IN ('composite', 'webcam', 'screen', 'audio')),
    storage_url TEXT NOT NULL,
    blob_pathname TEXT NOT NULL,
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes >= 0),
    resolution VARCHAR(32),
    fps INTEGER CHECK (fps IS NULL OR fps > 0),
    sample_rate_hz INTEGER CHECK (sample_rate_hz IS NULL OR sample_rate_hz > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (recording_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_recording_assets_recording_id
    ON recording_assets(recording_id);

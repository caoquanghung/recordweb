-- Never remove legacy duplicates automatically. Resolve them before applying if present.
CREATE UNIQUE INDEX recordings_owner_local_id_key
    ON recordings(user_id, local_id) WHERE local_id IS NOT NULL;

CREATE TABLE recording_upload_attempts (
    id UUID PRIMARY KEY,
    user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    local_id VARCHAR(128) NOT NULL,
    recording_id UUID NOT NULL DEFAULT gen_random_uuid(),
    status VARCHAR(16) NOT NULL DEFAULT 'uploading'
        CHECK (status IN ('uploading', 'cancelled', 'completed')),
    manifest JSONB NOT NULL CHECK (jsonb_typeof(manifest) = 'array'),
    lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 minutes',
    token_expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cleaned_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX recording_upload_attempts_active_key
    ON recording_upload_attempts(user_id, local_id) WHERE status = 'uploading';
CREATE INDEX recording_upload_attempts_cleanup_idx
    ON recording_upload_attempts(status, lease_expires_at, cleaned_at);

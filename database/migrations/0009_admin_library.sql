-- Durable deletion manifests intentionally survive user/account cascades.
CREATE TABLE admin_deletion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id VARCHAR(128) NOT NULL,
    target_user_id VARCHAR(128) NOT NULL,
    target_email VARCHAR(255) NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('recording', 'recordings', 'account')),
    recording_id UUID,
    recording_ids UUID[] NOT NULL DEFAULT '{}',
    blob_pathnames TEXT[] NOT NULL DEFAULT '{}',
    blob_cursor INTEGER NOT NULL DEFAULT 0 CHECK (blob_cursor >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'failed', 'completed')),
    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,
    cleanup_until TIMESTAMPTZ NOT NULL,
    last_cleanup_at TIMESTAMPTZ,
    cleanup_cursor INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CHECK ((scope = 'recording') = (recording_id IS NOT NULL))
);
CREATE UNIQUE INDEX admin_deletion_jobs_active_user
    ON admin_deletion_jobs(target_user_id) WHERE status <> 'completed';
CREATE INDEX admin_deletion_jobs_recent ON admin_deletion_jobs(created_at DESC);
CREATE INDEX admin_deletion_jobs_recording ON admin_deletion_jobs(recording_id);

-- Serialize manifest snapshots with new uploads and recording completion.
-- FOR SHARE conflicts with the user's FOR UPDATE lock in begin_admin_deletion.
CREATE FUNCTION guard_admin_recording_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    owner_id VARCHAR(128);
    target_recording UUID;
    target_local VARCHAR(128);
BEGIN
    IF TG_TABLE_NAME = 'recording_assets' THEN
        SELECT user_id, id, local_id INTO owner_id, target_recording, target_local
            FROM recordings WHERE id = NEW.recording_id;
    ELSIF TG_TABLE_NAME = 'recording_upload_attempts' THEN
        IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
        owner_id := NEW.user_id;
        target_recording := NEW.recording_id;
        target_local := NEW.local_id;
    ELSE
        owner_id := NEW.user_id;
        target_recording := NEW.id;
        target_local := NEW.local_id;
    END IF;
    PERFORM id FROM users WHERE id = owner_id FOR SHARE;
    IF EXISTS (
        SELECT 1 FROM admin_deletion_jobs j WHERE j.target_user_id = owner_id
        AND (j.status <> 'completed' OR j.scope = 'account')
        AND (j.scope <> 'recording' OR j.recording_id = target_recording
            OR (target_local IS NOT NULL AND EXISTS (
                SELECT 1 FROM recording_upload_attempts a
                WHERE a.recording_id = j.recording_id AND a.local_id = target_local AND a.user_id = owner_id
            )))
    ) THEN
        RAISE EXCEPTION 'Recording data is being deleted by an administrator' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER recordings_admin_deletion_guard
    BEFORE INSERT OR UPDATE OF user_id, storage_url, blob_pathname ON recordings
    FOR EACH ROW EXECUTE FUNCTION guard_admin_recording_write();
CREATE TRIGGER recording_assets_admin_deletion_guard
    BEFORE INSERT OR UPDATE ON recording_assets
    FOR EACH ROW EXECUTE FUNCTION guard_admin_recording_write();
CREATE TRIGGER recording_uploads_admin_deletion_guard
    BEFORE INSERT OR UPDATE OF status ON recording_upload_attempts
    FOR EACH ROW EXECUTE FUNCTION guard_admin_recording_write();

-- A delayed Clerk update must not recreate an account already being deleted.
CREATE FUNCTION guard_admin_account_mirror() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM admin_deletion_jobs
        WHERE target_user_id = NEW.id AND scope = 'account') THEN
        RETURN NULL;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER users_admin_account_guard BEFORE INSERT OR UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION guard_admin_account_mirror();

CREATE FUNCTION begin_admin_deletion(actor_id TEXT, owner_id TEXT, deletion_scope TEXT,
    selected_recording UUID, confirmed_email TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
    owner users%ROWTYPE;
    existing admin_deletion_jobs%ROWTYPE;
    result_id UUID;
    selected_ids UUID[];
    paths TEXT[];
    cleanup_deadline TIMESTAMPTZ;
BEGIN
    IF deletion_scope NOT IN ('recording', 'recordings', 'account')
        OR ((deletion_scope = 'recording') <> (selected_recording IS NOT NULL)) THEN
        RAISE EXCEPTION 'Invalid deletion scope' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO owner FROM users WHERE id = owner_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002'; END IF;
    IF owner_id = actor_id OR owner.role <> 'user' THEN
        RAISE EXCEPTION 'Protected account' USING ERRCODE = '42501';
    END IF;
    IF deletion_scope <> 'recording' AND confirmed_email IS DISTINCT FROM owner.email THEN
        RAISE EXCEPTION 'Email confirmation does not match' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO existing FROM admin_deletion_jobs
        WHERE target_user_id = owner_id AND status <> 'completed';
    IF FOUND THEN
        IF existing.scope = deletion_scope AND existing.recording_id IS NOT DISTINCT FROM selected_recording THEN
            RETURN existing.id;
        END IF;
        RAISE EXCEPTION 'Another deletion is pending for this user' USING ERRCODE = '55000';
    END IF;
    SELECT COALESCE(array_agg(id), '{}') INTO selected_ids FROM recordings
        WHERE user_id = owner_id AND (deletion_scope <> 'recording' OR id = selected_recording);
    IF deletion_scope = 'recording' AND cardinality(selected_ids) = 0 THEN
        RAISE EXCEPTION 'Recording not found' USING ERRCODE = 'P0002';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT pathname) FILTER (WHERE pathname IS NOT NULL), '{}') INTO paths FROM (
        SELECT COALESCE(blob_pathname, storage_url) AS pathname FROM recordings WHERE id = ANY(selected_ids)
        UNION ALL
        SELECT blob_pathname FROM recording_assets WHERE recording_id = ANY(selected_ids)
        UNION ALL
        SELECT asset->>'pathname' FROM recording_upload_attempts a,
            LATERAL jsonb_array_elements(a.manifest) asset
        WHERE a.user_id = owner_id AND (deletion_scope <> 'recording' OR a.recording_id = selected_recording
            OR a.local_id IN (SELECT local_id FROM recordings WHERE id = selected_recording))
    ) all_paths;
    SELECT GREATEST(NOW(), COALESCE(MAX(token_expires_at), NOW())) + INTERVAL '1 day'
        INTO cleanup_deadline FROM recording_upload_attempts WHERE user_id = owner_id;
    INSERT INTO admin_deletion_jobs (actor_user_id, target_user_id, target_email, scope,
        recording_id, recording_ids, blob_pathnames, cleanup_until)
        VALUES (actor_id, owner_id, owner.email, deletion_scope, selected_recording, selected_ids, paths, cleanup_deadline)
        RETURNING id INTO result_id;
    UPDATE recording_upload_attempts SET status = 'cancelled'
        WHERE user_id = owner_id AND (deletion_scope <> 'recording' OR recording_id = selected_recording
            OR local_id IN (SELECT local_id FROM recordings WHERE id = selected_recording));
    RETURN result_id;
END $$;

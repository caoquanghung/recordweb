-- How much of the body a posture image shows. Images captured before this
-- migration required the whole body, so existing rows default to 'full' with
-- no recorded head-to-hip length. See docs/note-note/calibration_profile_revision_1.md.
ALTER TABLE calibration_postures
    ADD COLUMN body_coverage TEXT NOT NULL DEFAULT 'full'
        CHECK (body_coverage IN ('full', 'hips')),
    ADD COLUMN head_to_hip_px NUMERIC(10, 3)
        CHECK (head_to_hip_px IS NULL OR head_to_hip_px > 0);

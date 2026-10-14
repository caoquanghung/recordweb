ALTER TABLE recording_assets
    DROP CONSTRAINT IF EXISTS recording_assets_kind_check;

ALTER TABLE recording_assets
    ADD CONSTRAINT recording_assets_kind_check
    CHECK (kind IN (
        'composite',
        'webcam',
        'screen',
        'audio',
        'microphone-audio',
        'system-audio'
    ));

CREATE TABLE photo_uploads (
    storage_key text PRIMARY KEY,
    uploader_id uuid NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_photo_uploads_uploader_created ON photo_uploads (uploader_id, created_at);
CREATE INDEX idx_photo_uploads_created_at ON photo_uploads (created_at);

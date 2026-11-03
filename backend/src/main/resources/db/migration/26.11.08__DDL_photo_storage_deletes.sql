CREATE TABLE photo_storage_deletes (
    url        text        PRIMARY KEY,
    queued_at  timestamptz NOT NULL DEFAULT now(),
    attempts   integer     NOT NULL DEFAULT 0,
    last_error text
);

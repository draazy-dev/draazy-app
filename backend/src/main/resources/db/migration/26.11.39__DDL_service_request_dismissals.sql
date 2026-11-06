CREATE TABLE service_request_dismissals (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id   uuid        NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dismissed_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_service_request_dismissals UNIQUE (request_id, user_id)
);

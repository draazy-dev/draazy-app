CREATE TABLE user_living_style (
    user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    answers    jsonb       NOT NULL CHECK (jsonb_typeof(answers) = 'object'),
    updated_at timestamptz NOT NULL DEFAULT now()
);

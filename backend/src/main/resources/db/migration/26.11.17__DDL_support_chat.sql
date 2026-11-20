CREATE TABLE support_conversations (
    user_id         uuid PRIMARY KEY REFERENCES users (id),
    status          text NOT NULL CHECK (status IN ('awaiting','answered','resolved')),
    assignee_id     uuid REFERENCES users (id),
    staff_unread    boolean NOT NULL DEFAULT false,
    user_unread     boolean NOT NULL DEFAULT false,
    last_at         timestamptz NOT NULL,
    last_preview    text,
    last_from       text CHECK (last_from IN ('user','staff')),
    last_about_type text,
    last_about_id   text,
    version         bigint NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_conversations_status_last ON support_conversations (status, last_at DESC);
CREATE INDEX idx_support_conversations_assignee_last ON support_conversations (assignee_id, last_at DESC);

CREATE TABLE support_conversation_topics (
    user_id      uuid NOT NULL REFERENCES users (id),
    about_type   text NOT NULL,
    about_id     text NOT NULL,
    status       text NOT NULL CHECK (status IN ('awaiting','answered')),
    staff_unread boolean NOT NULL DEFAULT false,
    last_at      timestamptz NOT NULL,
    last_preview text,
    last_from    text CHECK (last_from IN ('user','staff')),
    PRIMARY KEY (user_id, about_type, about_id)
);

CREATE INDEX idx_support_topics_type_last ON support_conversation_topics (about_type, last_at DESC);
CREATE INDEX idx_support_topics_user_state ON support_conversation_topics (user_id, status, staff_unread);

-- Listings and flatmate posts both keep review threads in property_reviews; this view maps each to its
-- owner and subject. A flatmate post with no review row yet still counts as open while awaiting moderation.
CREATE VIEW support_review_owners AS
SELECT pr.id AS review_id, p.owner_id AS user_id, 'property'::text AS about_type, p.id::text AS about_id,
       pr.status AS status
  FROM property_reviews pr
  JOIN properties p ON p.id = pr.property_id
UNION ALL
SELECT pr.id, r.host_id, 'flatmate_room', r.id::text,
       CASE WHEN r.archived THEN NULL
            ELSE coalesce(pr.status, CASE WHEN r.mod_status = 'pending' THEN 'pending' END) END
  FROM flatmate_rooms r
  LEFT JOIN property_reviews pr ON pr.flatmate_post_id = r.id
UNION ALL
SELECT pr.id, g.host_id, 'flatmate_group', g.id::text,
       CASE WHEN g.archived THEN NULL
            ELSE coalesce(pr.status, CASE WHEN g.mod_status = 'pending' THEN 'pending' END) END
  FROM flatmate_groups g
  LEFT JOIN property_reviews pr ON pr.flatmate_post_id = g.id
UNION ALL
SELECT pr.id, s.user_id, 'flatmate_post', s.id::text,
       CASE WHEN s.archived THEN NULL
            ELSE coalesce(pr.status, CASE WHEN s.mod_status = 'pending' THEN 'pending' END) END
  FROM flatmate_seeker_posts s
  LEFT JOIN property_reviews pr ON pr.flatmate_post_id = s.id;

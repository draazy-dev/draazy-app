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

ALTER TABLE support_ticket_messages
    ADD COLUMN about_type text
        CHECK (about_type IN ('property','flatmate_room','flatmate_group','flatmate_post','invoice')),
    ADD COLUMN about_id text,
    ADD CONSTRAINT support_ticket_messages_about_pair CHECK ((about_type IS NULL) = (about_id IS NULL));

UPDATE support_ticket_messages m
   SET about_type = t.about_type, about_id = t.about_id
  FROM support_tickets t
 WHERE t.id = m.ticket_id AND t.about_type IS NOT NULL;

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

CREATE TEMP TABLE chat_merge ON COMMIT DROP AS
SELECT t.id, k.id AS keep_id
  FROM support_tickets t
  JOIN (SELECT DISTINCT ON (user_id) id, user_id
          FROM support_tickets
         WHERE (category IS NULL OR category NOT IN ('identity_dispute','identity_appeal'))
           AND status NOT IN ('resolved','closed')
         ORDER BY user_id, updated_at DESC, id) k ON k.user_id = t.user_id
 WHERE (t.category IS NULL OR t.category NOT IN ('identity_dispute','identity_appeal'))
   AND t.status NOT IN ('resolved','closed');

UPDATE support_ticket_messages m
   SET ticket_id = c.keep_id
  FROM chat_merge c
 WHERE m.ticket_id = c.id AND c.id <> c.keep_id;

UPDATE support_tickets t
   SET staff_unread = agg.staff_unread, unread = agg.unread, version = t.version + 1
  FROM (SELECT c.keep_id, bool_or(s.staff_unread) AS staff_unread, bool_or(s.unread) AS unread
          FROM chat_merge c JOIN support_tickets s ON s.id = c.id
         GROUP BY c.keep_id) agg
 WHERE t.id = agg.keep_id;

UPDATE support_tickets t
   SET status = 'closed', staff_unread = false, unread = false, version = t.version + 1, updated_at = now()
  FROM chat_merge c
 WHERE t.id = c.id AND c.id <> c.keep_id;

DROP INDEX uq_support_tickets_open_about;

CREATE UNIQUE INDEX uq_support_tickets_open_chat ON support_tickets (user_id)
    WHERE (category IS NULL OR category NOT IN ('identity_dispute','identity_appeal'))
      AND status NOT IN ('resolved','closed');

INSERT INTO support_conversations
    (user_id, status, staff_unread, user_unread, last_at, last_preview, last_from, last_about_type, last_about_id)
WITH msgs AS (
    SELECT t.user_id, m.created_at AS at, m.body,
           CASE WHEN m.author_id = t.user_id THEN 'user' ELSE 'staff' END AS side,
           CASE WHEN t.category IN ('identity_dispute','identity_appeal') THEN 'identity'
                ELSE coalesce(m.about_type, 'general') END AS about_type,
           CASE WHEN t.category IN ('identity_dispute','identity_appeal') THEN t.id::text
                ELSE m.about_id END AS about_id
      FROM support_ticket_messages m
      JOIN support_tickets t ON t.id = m.ticket_id
    UNION ALL
    SELECT o.user_id, rm.created_at, rm.body,
           CASE WHEN rm.sender_id = o.user_id THEN 'user' ELSE 'staff' END,
           o.about_type, o.about_id
      FROM review_messages rm
      JOIN support_review_owners o ON o.review_id = rm.review_id
     WHERE NOT rm.internal
    UNION ALL
    SELECT sr.requester_id, sm.created_at, sm.body,
           CASE WHEN sm.author_role IN ('staff','manager','admin') THEN 'staff' ELSE 'user' END,
           'request', sr.id::text
      FROM service_request_messages sm
      JOIN service_requests sr ON sr.id = sm.request_id
     WHERE sr.requester_id IS NOT NULL
), latest AS (
    SELECT DISTINCT ON (user_id) user_id, at, body, side, about_type, about_id
      FROM msgs
     ORDER BY user_id, at DESC
), flags AS (
    SELECT user_id, bool_or(staff_unread) AS staff_unread, bool_or(user_unread) AS user_unread
      FROM (SELECT user_id, staff_unread, unread AS user_unread FROM support_tickets
            UNION ALL
            SELECT o.user_id, rm.sender_id = o.user_id AND rm.read_at IS NULL,
                   rm.sender_id IS DISTINCT FROM o.user_id AND rm.read_at IS NULL
              FROM review_messages rm
              JOIN support_review_owners o ON o.review_id = rm.review_id
             WHERE NOT rm.internal
            UNION ALL
            SELECT sr.requester_id,
                   sm.author_role NOT IN ('staff','manager','admin') AND sm.read_at IS NULL,
                   sm.author_role IN ('staff','manager','admin') AND sm.read_at IS NULL
              FROM service_request_messages sm
              JOIN service_requests sr ON sr.id = sm.request_id
             WHERE sr.requester_id IS NOT NULL) f
     GROUP BY user_id
)
SELECT l.user_id,
       CASE WHEN l.side = 'user' THEN 'awaiting' ELSE 'answered' END,
       coalesce(f.staff_unread, false), coalesce(f.user_unread, false),
       l.at, left(btrim(regexp_replace(l.body, '\s+', ' ', 'g')), 140), l.side, l.about_type, l.about_id
  FROM latest l
  LEFT JOIN flags f ON f.user_id = l.user_id;

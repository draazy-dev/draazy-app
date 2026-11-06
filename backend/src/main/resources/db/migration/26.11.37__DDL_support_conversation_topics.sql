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

INSERT INTO support_conversation_topics
    (user_id, about_type, about_id, status, staff_unread, last_at, last_preview, last_from)
WITH msgs AS (
    SELECT t.user_id, m.created_at AS at, m.body,
           CASE WHEN m.author_id = t.user_id THEN 'user' ELSE 'staff' END AS side,
           CASE WHEN t.category IN ('identity_dispute','identity_appeal') THEN 'identity'
                ELSE coalesce(m.about_type, 'general') END AS about_type,
           CASE WHEN t.category IN ('identity_dispute','identity_appeal') THEN t.id::text
                ELSE coalesce(m.about_id, '') END AS about_id,
           t.staff_unread AND m.author_id = t.user_id AS unread
      FROM support_ticket_messages m
      JOIN support_tickets t ON t.id = m.ticket_id
    UNION ALL
    SELECT o.user_id, rm.created_at, rm.body,
           CASE WHEN rm.sender_id = o.user_id THEN 'user' ELSE 'staff' END,
           o.about_type, o.about_id,
           rm.sender_id = o.user_id AND rm.read_at IS NULL
      FROM review_messages rm
      JOIN support_review_owners o ON o.review_id = rm.review_id
     WHERE NOT rm.internal
    UNION ALL
    SELECT sr.requester_id, sm.created_at, sm.body,
           CASE WHEN sm.author_role IN ('staff','manager','admin') THEN 'staff' ELSE 'user' END,
           'request', sr.id::text,
           sm.author_role NOT IN ('staff','manager','admin') AND sm.read_at IS NULL
      FROM service_request_messages sm
      JOIN service_requests sr ON sr.id = sm.request_id
     WHERE sr.requester_id IS NOT NULL
), latest AS (
    SELECT DISTINCT ON (user_id, about_type, about_id) user_id, about_type, about_id, at, body, side
      FROM msgs
     ORDER BY user_id, about_type, about_id, at DESC
), unread AS (
    SELECT user_id, about_type, about_id, bool_or(unread) AS staff_unread
      FROM msgs
     GROUP BY user_id, about_type, about_id
)
SELECT l.user_id, l.about_type, l.about_id,
       CASE WHEN l.side = 'user' THEN 'awaiting' ELSE 'answered' END,
       coalesce(u.staff_unread, false), l.at,
       left(btrim(regexp_replace(l.body, '\s+', ' ', 'g')), 140), l.side
  FROM latest l
  JOIN unread u USING (user_id, about_type, about_id)
 WHERE l.user_id IS NOT NULL;

UPDATE support_conversations c
   SET status = 'awaiting'
 WHERE c.status = 'answered'
   AND EXISTS (SELECT 1 FROM support_conversation_topics t WHERE t.user_id = c.user_id AND t.status = 'awaiting');

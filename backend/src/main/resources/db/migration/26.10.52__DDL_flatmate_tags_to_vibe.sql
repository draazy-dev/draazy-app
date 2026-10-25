-- Per-post lifestyle tags are replaced by the author's living style (user_living_style).
-- Tags that map onto a living-style question seed it first, so no stated preference is lost.

-- The author's tags -> one answer per question. When an author's posts disagree on a question the most
-- recently updated post wins; a tie on the same instant takes the lower (stricter) answer.
WITH author_tags AS (
    SELECT r.host_id AS author_id, t.v AS tag, r.updated_at FROM flatmate_rooms r,
        jsonb_array_elements_text(r.tags) AS t(v)
    UNION ALL
    SELECT g.host_id, t.v, g.updated_at FROM flatmate_groups g,
        jsonb_array_elements_text(g.tags) AS t(v)
    UNION ALL
    SELECT p.user_id, t.v, p.updated_at FROM flatmate_seeker_posts p,
        jsonb_array_elements_text(p.tags) AS t(v)
),
mapped AS (
    SELECT a.author_id, m.question, m.answer, a.updated_at
    FROM author_tags a
    JOIN (VALUES ('vegetarian', 'food', 0),
                 ('non-veg ok', 'food', 2),
                 ('non-smoker', 'smoking', 0),
                 ('early riser', 'sleep', 0),
                 ('night owl', 'sleep', 2),
                 ('pet-friendly', 'pets', 1)) AS m(tag, question, answer)
      ON lower(btrim(a.tag)) = m.tag
),
picked AS (
    SELECT DISTINCT ON (author_id, question) author_id, question, answer
    FROM mapped
    ORDER BY author_id, question, updated_at DESC, answer
),
derived AS (
    SELECT author_id, jsonb_object_agg(question, answer) AS answers
    FROM picked
    GROUP BY author_id
)
INSERT INTO user_living_style (user_id, answers, updated_at)
SELECT d.author_id, d.answers, now()
FROM derived d
ON CONFLICT (user_id) DO UPDATE
    SET answers = EXCLUDED.answers || user_living_style.answers,
        updated_at = now()
    WHERE EXCLUDED.answers || user_living_style.answers <> user_living_style.answers;

-- Alerts: `habits` (tag names) becomes `vibe` (question:answer tokens). Criteria also lives in `filters`
-- for older rows, which the matcher falls back to.
CREATE FUNCTION pg_temp.habits_to_vibe(doc jsonb) RETURNS jsonb AS $$
    SELECT CASE WHEN v.tokens IS NULL THEN doc - 'habits'
                ELSE (doc - 'habits') || jsonb_build_object('vibe', v.tokens) END
    FROM (
        SELECT jsonb_agg(d.token ORDER BY d.token) AS tokens
        FROM (
            SELECT DISTINCT m.token
            FROM jsonb_array_elements_text(
                     CASE WHEN jsonb_typeof(doc -> 'habits') = 'array' THEN doc -> 'habits' ELSE '[]'::jsonb END
                 ) AS h(v)
            JOIN (VALUES ('non-smoker', 'smoking:0'),
                         ('vegetarian', 'food:0'),
                         ('pet-friendly', 'pets:1'),
                         ('pet-friendly', 'pets:2'),
                         ('pets', 'pets:1'),
                         ('pets', 'pets:2')) AS m(habit, token)
              ON lower(btrim(h.v)) = m.habit
        ) d
    ) v
$$ LANGUAGE sql IMMUTABLE;

UPDATE saved_searches
SET criteria = pg_temp.habits_to_vibe(criteria)
WHERE kind = 'flatmates' AND jsonb_typeof(criteria) = 'object' AND criteria ? 'habits';

UPDATE saved_searches
SET filters = pg_temp.habits_to_vibe(filters)
WHERE kind = 'flatmates' AND jsonb_typeof(filters) = 'object' AND filters ? 'habits';

DROP FUNCTION pg_temp.habits_to_vibe(jsonb);

DROP INDEX IF EXISTS idx_flatmate_rooms_tags;
DROP INDEX IF EXISTS idx_flatmate_groups_tags;
DROP INDEX IF EXISTS idx_flatmate_seeker_posts_tags;

ALTER TABLE flatmate_rooms DROP COLUMN tags;
ALTER TABLE flatmate_groups DROP COLUMN tags;
ALTER TABLE flatmate_seeker_posts DROP COLUMN tags;

COMMENT ON COLUMN flatmate_groups.recheck_requested_at IS
    'As flatmate_rooms.recheck_requested_at, for a group: raised by an edit to the title, the note '
    'or the rent on a group that is already on the board.';

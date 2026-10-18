-- Drafts still waiting on a second-operator check go out to the customer: one operator's share is final.
-- A sent-back draft stays with its operator to fix and re-share.
WITH held AS (
    SELECT DISTINCT ON (c.request_id) c.request_id, c.shared_by
      FROM service_request_draft_checks c
     ORDER BY c.request_id, c.draft_version DESC
), publish AS (
    UPDATE service_requests r
       SET status = 'draft-shared',
           status_changed_at = now(),
           updated_at = now(),
           version = r.version + 1
      FROM held h
      JOIN service_request_draft_checks c ON c.request_id = h.request_id
     WHERE r.id = h.request_id
       AND c.status = 'pending'
       AND c.draft_version = (SELECT max(draft_version) FROM service_request_draft_checks WHERE request_id = h.request_id)
       AND r.status IN ('assigned', 'in-progress', 'changes-requested')
    RETURNING r.id, h.shared_by
)
INSERT INTO service_request_timeline (request_id, event, by)
SELECT p.id, 'draft.shared', u.name
  FROM publish p
  LEFT JOIN users u ON u.id = p.shared_by;

UPDATE service_request_draft_checks SET status = 'released', updated_at = now() WHERE status = 'pending';

DELETE FROM service_request_timeline WHERE event LIKE 'draft.check-%';

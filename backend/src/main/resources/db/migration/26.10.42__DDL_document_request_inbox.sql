ALTER TABLE document_requests DROP CONSTRAINT IF EXISTS document_requests_status_check;
ALTER TABLE document_requests ADD CONSTRAINT document_requests_status_check
    CHECK (status IN ('pending', 'granted', 'declined', 'expired', 'withdrawn'));

ALTER TABLE request_reminders DROP CONSTRAINT IF EXISTS request_reminders_kind_check;
ALTER TABLE request_reminders ADD CONSTRAINT request_reminders_kind_check
    CHECK (kind IN ('contact', 'visit', 'photo', 'flatmate', 'group', 'document'));

ALTER TABLE request_hidden DROP CONSTRAINT IF EXISTS request_hidden_kind_check;
ALTER TABLE request_hidden ADD CONSTRAINT request_hidden_kind_check
    CHECK (kind IN ('contact', 'visit', 'photo', 'flatmate', 'group', 'document'));

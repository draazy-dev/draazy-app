ALTER TABLE request_reminders DROP CONSTRAINT IF EXISTS request_reminders_kind_check;
ALTER TABLE request_reminders ADD CONSTRAINT request_reminders_kind_check
    CHECK (kind IN ('contact', 'visit', 'photo', 'flatmate', 'group', 'document', 'offer'));

ALTER TABLE request_hidden DROP CONSTRAINT IF EXISTS request_hidden_kind_check;
ALTER TABLE request_hidden ADD CONSTRAINT request_hidden_kind_check
    CHECK (kind IN ('contact', 'visit', 'photo', 'flatmate', 'group', 'document', 'offer'));

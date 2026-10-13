-- Per-kind flatmate interest (room, group, seeker) is no longer audited.
DELETE FROM audit_log WHERE action LIKE 'flatmate.%.interest';

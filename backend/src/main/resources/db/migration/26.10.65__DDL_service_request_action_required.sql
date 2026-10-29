-- `action-required`: the desk sent the case back to one side for a correction; `attention` holds the ask.
ALTER TABLE service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE service_requests ADD CONSTRAINT service_requests_status_check
    CHECK (status IN ('awaiting-payment', 'new', 'assigned', 'in-progress', 'draft-shared',
                      'changes-requested', 'action-required', 'approved', 'completed', 'cancelled'));

ALTER TABLE service_requests ADD COLUMN attention jsonb;

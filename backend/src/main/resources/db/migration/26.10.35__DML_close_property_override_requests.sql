-- The status check allows only pending and approved, and approved needs a second staffer, so a request
-- that will never be actioned can only be removed.
DELETE FROM property_verification_override_requests WHERE status = 'pending';

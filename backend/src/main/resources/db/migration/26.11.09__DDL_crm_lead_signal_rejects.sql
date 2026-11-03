-- A signal with no lead marks a feed row the intake rejected for good, so the feed stops re-selecting it.
ALTER TABLE crm_lead_signals ALTER COLUMN lead_id DROP NOT NULL;

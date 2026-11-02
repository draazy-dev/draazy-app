-- One profile per mobile: who the person is, what they offer or want, and where we found them.
ALTER TABLE crm_leads
    ADD COLUMN lead_type      text CHECK (lead_type IN ('owner', 'seeker', 'flatmate')),
    ADD COLUMN intent         text CHECK (intent IN ('sell', 'rent-out', 'buy', 'rent', 'has-room', 'needs-room')),
    ADD COLUMN property_types text[] NOT NULL DEFAULT '{}',
    ADD COLUMN bhk            text[] NOT NULL DEFAULT '{}',
    ADD COLUMN localities     text CHECK (char_length(localities) <= 200),
    ADD COLUMN budget         bigint CHECK (budget > 0),
    ADD COLUMN lead_source    text CHECK (lead_source IN ('walk-in', 'inbound-call', 'whatsapp', 'facebook',
                                                          'instagram', 'referral', 'flyer', 'draazy', 'portal',
                                                          'other')),
    ADD COLUMN source_detail  text CHECK (char_length(source_detail) <= 120);

CREATE INDEX idx_crm_leads_type ON crm_leads (lead_type, last_signal_at DESC);

ALTER TABLE crm_lead_signals DROP CONSTRAINT crm_lead_signals_source_check;
ALTER TABLE crm_lead_signals ADD CONSTRAINT crm_lead_signals_source_check
    CHECK (source IN ('rent-agreement', 'unpaid-checkout', 'quote-request', 'lease-ending', 'manual', 'flatmate'));

ALTER TABLE crm_lead_activities DROP CONSTRAINT crm_lead_activities_kind_check;
ALTER TABLE crm_lead_activities ADD CONSTRAINT crm_lead_activities_kind_check
    CHECK (kind IN ('call', 'whatsapp', 'sms', 'note', 'stage', 'assign', 'claim', 'release', 'reveal', 'convert',
                    'profile'));

-- Not keyed to an account: an owner a tenant named can reply STOP without ever signing up.
CREATE TABLE whatsapp_opt_outs (
    mobile     text PRIMARY KEY,
    opted_out  boolean NOT NULL,
    changed_at timestamptz NOT NULL
);

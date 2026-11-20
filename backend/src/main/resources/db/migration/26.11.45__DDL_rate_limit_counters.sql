CREATE TABLE rate_limit_counters (
    bucket     text        PRIMARY KEY,
    hits       integer     NOT NULL,
    window_end timestamptz NOT NULL
);

CREATE INDEX rate_limit_counters_window_end_idx ON rate_limit_counters (window_end);

COMMENT ON TABLE rate_limit_counters IS
    'Fixed-window counters for draazy.ratelimit.store=postgres, so budgets survive redeploys and are shared across '
    'instances. bucket is a SHA-256 of namespace:key because keys can be an IP or a mobile. Expired rows are inert '
    'and purged hourly.';

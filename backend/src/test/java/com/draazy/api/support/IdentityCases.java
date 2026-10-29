package com.draazy.api.support;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

public final class IdentityCases {
    private IdentityCases() {
    }

    public static void submitted(JdbcTemplate jdbc, UUID userId) {
        jdbc.update("insert into identity_verifications (user_id, status, doc_type, consent_at, submitted_at)"
                + " values (?, 'pending', 'aadhaar', now(), now()) on conflict do nothing", userId);
    }
}

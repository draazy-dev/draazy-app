package com.draazy.api.support;

import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** A KYC case in review: enough to file a verification request, never enough to have one approved. */
public final class IdentityCases {

    private IdentityCases() {
    }

    public static void submitted(JdbcTemplate jdbc, UUID userId) {
        jdbc.update("insert into identity_verifications (user_id, status, doc_type, consent_at, submitted_at)"
                + " values (?, 'pending', 'aadhaar', now(), now()) on conflict do nothing", userId);
    }
}

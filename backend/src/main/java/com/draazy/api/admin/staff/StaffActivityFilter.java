package com.draazy.api.admin.staff;

import com.draazy.api.common.persistence.LikePatterns;
import java.time.Instant;
import java.util.Locale;

record StaffActivityFilter(
        String actor,
        String entity,
        String action,
        Instant from,
        Instant to,
        String q,
        String actorRole) {
    StaffActivityFilter {
        actor = blankToNull(actor);
        entity = blankToNull(entity);
        action = blankToNull(action);
        q = blankToNull(q);
        actorRole = blankToNull(actorRole);
    }

    String like() {
        return q == null ? null : "%" + LikePatterns.escape(q.toLowerCase(Locale.ROOT)) + "%";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

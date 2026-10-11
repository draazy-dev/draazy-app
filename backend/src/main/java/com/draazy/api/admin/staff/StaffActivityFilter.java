package com.draazy.api.admin.staff;

import com.draazy.api.common.persistence.LikePatterns;
import java.time.Instant;
import java.util.Locale;

// One record shared by the feed, totals, splits and leaderboard, so every view filters the same window.
// Each field is null for "all"; `to` is exclusive, `q` matches actor name, action, entity and entity id.
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

    /** The {@code q} term as an escaped, lower-cased {@code like} pattern, so {@code 100%} is not a match-all. */
    String like() {
        return q == null ? null : "%" + LikePatterns.escape(q.toLowerCase(Locale.ROOT)) + "%";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

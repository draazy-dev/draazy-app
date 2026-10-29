package com.draazy.api.common.persistence;

import java.util.Locale;

public final class LikePatterns {
    private LikePatterns() {
    }

    // JPQL/Criteria callers must declare escape '\'; Hibernate otherwise
    // renders escape '' and \ matches itself.
    public static String escape(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    public static String contains(String q) {
        return q == null || q.isBlank() ? null : "%" + escape(q.strip().toLowerCase(Locale.ROOT)) + "%";
    }
}

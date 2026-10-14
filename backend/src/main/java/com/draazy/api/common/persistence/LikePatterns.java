package com.draazy.api.common.persistence;

import java.util.Locale;

/** Binding stops input rewriting a statement but leaves {@code %} and {@code _} as wildcards. */
public final class LikePatterns {

    private LikePatterns() {
    }

    // JPQL/Criteria callers must say escape '\\'; Hibernate otherwise renders escape '' and \ matches itself.
    public static String escape(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    /** The lower-cased {@code %text%} pattern for a free-text query, or null when there is none. */
    public static String contains(String q) {
        return q == null || q.isBlank() ? null : "%" + escape(q.strip().toLowerCase(Locale.ROOT)) + "%";
    }
}

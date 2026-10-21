package com.draazy.api.documents.request;

/** The {@code DocumentRequest.status} vocabulary; the table's CHECK constraint is the real enforcement. */
public final class DocumentRequestStatuses {

    private DocumentRequestStatuses() {
    }

    public static final String PENDING = "pending";
    public static final String GRANTED = "granted";
    public static final String DECLINED = "declined";
    public static final String WITHDRAWN = "withdrawn";

    // Reached by the clock only; the share-token check reads expiresAt, not this label.
    public static final String EXPIRED = "expired";

    // Both end states are terminal: a "no" never turns into a "yes" without the buyer asking again.
    public static boolean canTransition(String from, String to) {
        return PENDING.equals(from) && (GRANTED.equals(to) || DECLINED.equals(to));
    }
}
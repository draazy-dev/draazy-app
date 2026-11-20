package com.draazy.api.documents.request;

public final class DocumentRequestStatuses {
    private DocumentRequestStatuses() {
    }

    public static final String PENDING = "pending";
    public static final String GRANTED = "granted";
    public static final String DECLINED = "declined";
    public static final String WITHDRAWN = "withdrawn";

    public static final String EXPIRED = "expired";

    public static boolean canTransition(String from, String to) {
        return PENDING.equals(from) && (GRANTED.equals(to) || DECLINED.equals(to));
    }
}
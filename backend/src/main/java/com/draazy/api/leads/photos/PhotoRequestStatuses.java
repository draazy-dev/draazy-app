package com.draazy.api.leads.photos;

public final class PhotoRequestStatuses {
    private PhotoRequestStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String RESOLVED = "resolved";

    public static final String DECLINED = "declined";

    public static final String WITHDRAWN = "withdrawn";

    public static boolean isTerminal(String status) {
        return RESOLVED.equals(status) || DECLINED.equals(status);
    }
}

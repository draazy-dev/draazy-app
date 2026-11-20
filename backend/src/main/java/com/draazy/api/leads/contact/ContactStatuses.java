package com.draazy.api.leads.contact;

public final class ContactStatuses {
    private ContactStatuses() {
    }

    public static final String OWNER = "owner";

    public static final String APPROVED = "approved";

    public static final String PENDING = "pending";

    public static final String DECLINED = "declined";

    public static final String EXPIRED = "expired";

    public static final String NONE = "none";

    public static boolean revealsContact(String status) {
        return APPROVED.equals(status) || OWNER.equals(status);
    }
    }

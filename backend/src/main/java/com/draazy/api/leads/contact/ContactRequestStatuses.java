package com.draazy.api.leads.contact;

// Separate from viewer statuses: this is the stored column vocabulary.
// Every value is traced to the `ContactRequest.status` enum in the OpenAPI spec and to the the database CHECK.
public final class ContactRequestStatuses {

    private ContactRequestStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String APPROVED = "approved";

    public static final String DECLINED = "declined";

    public static final String EXPIRED = "expired";

    public static final String WITHDRAWN = "withdrawn";

    public static final String RESPONSE_PATTERN = "^(" + APPROVED + "|" + DECLINED + ")$";

    // Only pending can transition; terminal states reject a second PATCH.
    public static boolean canTransition(String current, String next) {
        return PENDING.equals(current) && (APPROVED.equals(next) || DECLINED.equals(next));
    }
}

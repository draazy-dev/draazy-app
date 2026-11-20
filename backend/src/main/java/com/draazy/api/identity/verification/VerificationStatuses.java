package com.draazy.api.identity.verification;

public final class VerificationStatuses {
    private VerificationStatuses() {
    }

    public static final String NONE = "none";

    public static final String PENDING = "pending";

    public static final String VERIFIED = "verified";

    public static final String REJECTED = "rejected";

    public static final String REVOKED = "revoked";

    public static final String WITHDRAWN = "withdrawn";
}

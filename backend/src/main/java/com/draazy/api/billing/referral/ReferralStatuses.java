package com.draazy.api.billing.referral;

import java.util.Set;

public final class ReferralStatuses {
    private ReferralStatuses() {
    }

    public static final String PENDING = "pending";

    public static final String QUALIFIED = "qualified";

    public static final String HELD = "held";

    public static final String REWARDED = "rewarded";

    public static final String REJECTED = "rejected";

    public static final String CLAWED_BACK = "clawed-back";

    private static final Set<String> GRANTING = Set.of(QUALIFIED, REWARDED);

    private static final Set<String> APPROVABLE = Set.of(PENDING, QUALIFIED, HELD, REJECTED);

    private static final Set<String> REJECTABLE = Set.of(PENDING, QUALIFIED, HELD);

    private static final Set<String> FRIEND_ELIGIBLE = Set.of(PENDING, QUALIFIED, HELD, REWARDED);

    public static boolean isGranting(String status) {
        return GRANTING.contains(status);
    }

    public static boolean canApprove(String status) {
        return APPROVABLE.contains(status);
    }

    public static boolean canReject(String status) {
        return REJECTABLE.contains(status);
    }

    public static boolean canClawBack(String status) {
        return GRANTING.contains(status);
    }

    public static boolean keepsFriendReward(String status) {
        return FRIEND_ELIGIBLE.contains(status);
    }

    public static final String TRACK_OWNER = "owner";
    public static final String TRACK_SEEKER = "seeker";

    public static final String RISK_LOW = "low";
    public static final String RISK_MEDIUM = "medium";
    public static final String RISK_HIGH = "high";

    public static final String SYSTEM = "system";
}

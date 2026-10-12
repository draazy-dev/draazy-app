package com.draazy.api.billing.referral;

import java.util.Set;

/** The {@code referrals.status} vocabulary and the transitions the desk may force. */
public final class ReferralStatuses {

    private ReferralStatuses() {
    }

    /** Redeemed; the referee has not yet done the thing that decides the track. */
    public static final String PENDING = "pending";

    /** Decided automatically and earning its reward. */
    public static final String QUALIFIED = "qualified";

    /** Medium risk: waiting for {@code hold_until}, when the sweep grants or rejects it. */
    public static final String HELD = "held";

    /** Forced through by a staff override; earns like {@link #QUALIFIED}. */
    public static final String REWARDED = "rewarded";

    public static final String REJECTED = "rejected";

    /** A granted reward, reversed. Distinct from {@link #REJECTED}: paid and recovered, not never paid. */
    public static final String CLAWED_BACK = "clawed-back";

    private static final Set<String> GRANTING = Set.of(QUALIFIED, REWARDED);

    private static final Set<String> APPROVABLE = Set.of(PENDING, QUALIFIED, HELD, REJECTED);

    private static final Set<String> REJECTABLE = Set.of(PENDING, QUALIFIED, HELD);

    /** Statuses where the referee's friend bonus still stands. */
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

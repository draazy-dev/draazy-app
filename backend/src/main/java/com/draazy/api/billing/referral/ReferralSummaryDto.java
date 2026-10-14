package com.draazy.api.billing.referral;

/** The caller's own view of the scheme; {@code earned} is by track, spendable via {@code GET /me/entitlements}. */
public record ReferralSummaryDto(
        String code,
        int invited,
        int converted,
        int held,
        Earned earned,
        FriendReward friendReward) {

    public record Earned(OwnerTrack owner, SeekerTrack seeker) {
    }

    /** Granting owner-track referrals and the free rent agreements they earned. */
    public record OwnerTrack(int referrals, int agreements) {
    }

    /** Granting seeker-track referrals and the owner contacts they earned. */
    public record SeekerTrack(int referrals, int contacts) {
    }

    /** What joining through a code gives the caller: free contacts now, Featured days on a first verified listing. */
    public record FriendReward(boolean redeemed, String status, String track, int contacts, int featuredDays) {
    }
}

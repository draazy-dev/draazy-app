package com.draazy.api.billing.referral;

public record ReferralSummaryDto(
        String code,
        int invited,
        int converted,
        int held,
        Earned earned,
        FriendReward friendReward) {
    public record Earned(OwnerTrack owner, SeekerTrack seeker) {
    }

    public record OwnerTrack(int referrals, int agreements) {
    }

    public record SeekerTrack(int referrals, int contacts) {
    }

    public record FriendReward(boolean redeemed, String status, String track, int contacts, int featuredDays) {
    }
}

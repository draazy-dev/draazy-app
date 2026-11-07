package com.draazy.api.billing.referral;

public record ReferralSummaryDto(
        String code,
        int invited,
        int joined,
        int qualified,
        int checking,
        Rewards rewards,
        FriendReward friendReward) {
    public record Rewards(int earned, int used, int remaining, int discountPercent) {
    }

    public record FriendReward(boolean redeemed, String status, String track, int contacts, int featuredDays) {
    }
}

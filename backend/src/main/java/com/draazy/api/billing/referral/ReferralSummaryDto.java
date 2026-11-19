package com.draazy.api.billing.referral;

import java.util.List;

public record ReferralSummaryDto(
        String code,
        int invited,
        int joined,
        int qualified,
        int checking,
        Rewards rewards,
        FriendReward friendReward,
        List<Friend> friends) {
    public record Rewards(int earned, int used, int remaining, int locked, int discountPercent) {
    }

    public record FriendReward(boolean redeemed, String status, String track, int contacts, int featuredDays) {
    }

    public record Friend(String name, String mobile, String at, String track, String state, String kycPending) {
    }
}

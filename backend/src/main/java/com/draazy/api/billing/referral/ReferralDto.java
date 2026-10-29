package com.draazy.api.billing.referral;

import java.time.Instant;

public record ReferralDto(
        String id,
        String referrer,
        String referrerMobile,
        String referred,
        String referredMobile,
        String channel,
        String reward,
        long rewardAmount,
        String status,
        String track,
        String risk,
        boolean identityVerified,
        boolean identityUnique,
        boolean sameDevice,
        boolean sameIp,
        boolean velocityHigh,
        boolean activated,
        Instant holdUntil,
        String autoReason,
        Instant at) {
}

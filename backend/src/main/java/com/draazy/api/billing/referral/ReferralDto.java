package com.draazy.api.billing.referral;

import java.time.Instant;

/** Contract {@code Referral}: the fraud desk's audit row. Rationale: docs/flows/ops/referrals-fraud.md. */
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

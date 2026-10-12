package com.draazy.api.common.settings;

import java.math.BigDecimal;

/** Named fields rather than the {@code fees} block, so a fraud threshold ops adds there
 * (e.g. {@code referralVelocityPerDay}) is never published: the type decides, not a filter. */
public record PricingResponse(
        long listingPass,
        long contactPack,
        long rentAgreementPlatform,
        BigDecimal gstPercent,
        Referral referral) {

    /** The numbers the referral and Refer screens quote; each is an admin setting under {@code fees}. */
    public record Referral(
            long contactBonus,
            long seekerBonusContacts,
            long ownerFeaturedDays,
            long ownerRewardAgreements,
            long featuredDays,
            long qualifyPerMonth,
            long qualifyPerYear,
            long holdDays,
            long clawbackDays,
            long signupWindowHours) {
    }
}

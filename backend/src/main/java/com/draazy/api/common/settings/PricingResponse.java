package com.draazy.api.common.settings;

public record PricingResponse(
        long listingPass,
        long contactPack,
        long rentAgreementPlatform,
        Referral referral,
        Refunds refunds) {
    public record Refunds(
            long packRefundDays,
            long passGuaranteeDays,
            long passGuaranteeMaxEnquiries,
            long passGuaranteeEveryMonths,
            long contactReplyDays) {
    }

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

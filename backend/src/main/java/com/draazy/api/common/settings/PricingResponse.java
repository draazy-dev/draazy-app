package com.draazy.api.common.settings;

public record PricingResponse(
        long listingPass,
        long listingPassBuy,
        long contactPack,
        long contactPackBuy,
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
            long seekerBonusContacts,
            long ownerFeaturedDays,
            long agreementDiscountPercent,
            long featuredDays,
            long qualifyPerMonth,
            long qualifyPerYear,
            long holdDays,
            long clawbackDays,
            long signupWindowHours) {
    }
}

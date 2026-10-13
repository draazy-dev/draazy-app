package com.draazy.api.common.settings;

import org.springframework.stereotype.Component;

/** Builds the public {@link PricingResponse}; never the raw {@code fees} block. */
@Component
public class PricingController {

    private final PlatformSettings settings;

    public PricingController(PlatformSettings settings) {
        this.settings = settings;
    }

    /** Each accessor falls back to the seeded figure and logs: a 500 on the plans page beats a stale price. */
    public PricingResponse pricing() {
        return new PricingResponse(
                settings.listingPass(),
                settings.contactPack(),
                settings.rentAgreementPlatform(),
                new PricingResponse.Referral(
                        settings.referralContactBonus(),
                        settings.referralSeekerBonusContacts(),
                        settings.referralOwnerFeaturedDays(),
                        settings.referralOwnerRewardAgreements(),
                        settings.featuredDays(),
                        settings.referralQualifyPerMonth(),
                        settings.referralQualifyPerYear(),
                        settings.referralHoldDays(),
                        settings.referralClawbackDays(),
                        settings.referralSignupWindowHours()),
                new PricingResponse.Refunds(
                        settings.packRefundDays(),
                        settings.passGuaranteeDays(),
                        settings.passGuaranteeMaxEnquiries(),
                        settings.passGuaranteeEveryMonths(),
                        settings.contactReplyDays()));
    }
}

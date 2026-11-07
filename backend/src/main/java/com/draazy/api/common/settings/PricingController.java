package com.draazy.api.common.settings;

import org.springframework.stereotype.Component;

@Component
public class PricingController {
    private final PlatformSettings settings;

    public PricingController(PlatformSettings settings) {
        this.settings = settings;
    }

    public PricingResponse pricing() {
        return new PricingResponse(
                settings.listingPass(),
                settings.listingPassBuy(),
                settings.contactPack(),
                settings.contactPackBuy(),
                settings.rentAgreementPlatform(),
                new PricingResponse.Referral(
                        settings.referralSeekerBonusContacts(),
                        settings.referralOwnerFeaturedDays(),
                        settings.referralAgreementDiscountPercent(),
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

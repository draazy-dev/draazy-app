package com.draazy.api.common.settings;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class PricingEndpointTest extends AbstractApiTest {
    @Autowired UserRepository users;

    private String adminToken() {
        User u = new User("9869100001", Roles.Wire.ADMIN);
        u.setName("Pricing Admin");
        u.setMobileVerified(true);
        return "Bearer " + jwtService.issueAccessToken(users.saveAndFlush(u));
    }

    @Test
    void anonymousCallersGetThePriceList() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pricing.listingPass").value(999));
    }

    @Test
    void everyPriceTheClientNeedsIsPublished() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pricing.listingPass").exists())
                .andExpect(jsonPath("$.pricing.contactPack").exists())
                .andExpect(jsonPath("$.pricing.rentAgreementPlatform").exists())
                .andExpect(jsonPath("$.pricing.ownerProYearly").doesNotExist());
    }

    @Test
    void aPriceAnAdminChangesIsThePriceAnAnonymousVisitorIsQuoted() throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fees\":{\"listingPass\":1499,\"contactPack\":349}}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pricing.listingPass").value(1499))
                .andExpect(jsonPath("$.pricing.contactPack").value(349))
                .andExpect(jsonPath("$.pricing.rentAgreementPlatform").value(499));
    }

    @Test
    void theRestOfTheFeesBlockIsNotPublished() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pricing.referralQualifyPerMonth").doesNotExist())
                .andExpect(jsonPath("$.pricing.referralContactBonus").doesNotExist())
                .andExpect(jsonPath("$.pricing.freeContactLimit").doesNotExist())
                .andExpect(jsonPath("$.pricing.referral.velocityPerDay").doesNotExist())
                .andExpect(jsonPath("$.pricing.referral.signalRetentionDays").doesNotExist());
    }

    @Test
    void theReferralNumbersAreAdminSettingsPublishedForTheClient() throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fees\":{\"referralSeekerBonusContacts\":8,"
                                + "\"referralOwnerFeaturedDays\":21,\"featuredDays\":10}}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.pricing.referral.contactBonus").value(15))
                .andExpect(jsonPath("$.pricing.referral.seekerBonusContacts").value(8))
                .andExpect(jsonPath("$.pricing.referral.ownerFeaturedDays").value(21))
                .andExpect(jsonPath("$.pricing.referral.ownerRewardAgreements").value(1))
                .andExpect(jsonPath("$.pricing.referral.featuredDays").value(10))
                .andExpect(jsonPath("$.pricing.referral.qualifyPerMonth").value(10))
                .andExpect(jsonPath("$.pricing.referral.qualifyPerYear").value(50))
                .andExpect(jsonPath("$.pricing.referral.holdDays").value(7))
                .andExpect(jsonPath("$.pricing.referral.clawbackDays").value(30))
                .andExpect(jsonPath("$.pricing.referral.signupWindowHours").value(24));
    }

    @Test
    void anOutOfBoundsReferralNumberIsRefused() throws Exception {
        String admin = adminToken();
        for (String bad : new String[] {"\"referralHoldDays\":0", "\"referralQualifyPerMonth\":-1",
                "\"referralOwnerFeaturedDays\":365", "\"featuredDays\":0",
                "\"referralSignalRetentionDays\":\"x\"", "\"referralSignalRetentionDays\":181",
                "\"referralSignalRetentionDays\":29"}) {
            mvc.perform(put(Routes.Admin.SETTINGS)
                            .header(HttpHeaders.AUTHORIZATION, admin)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"fees\":{" + bad + "}}"))
                    .andExpect(status().is4xxClientError());
        }
    }
}

package com.draazy.api.deals.offer;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.finance.tenancy.TenantProfile;
import com.draazy.api.finance.tenancy.TenantProfileRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class PartyVerifiedBadgeTest extends AbstractApiTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired TenantProfileRepository tenantProfiles;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Test " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String title) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private void tenantProfile(User u, boolean verified) {
        TenantProfile profile = new TenantProfile(u.getId());
        profile.setVerified(verified);
        tenantProfiles.saveAndFlush(profile);
    }

    private void submitOffer(User buyer, Property p, long amount) throws Exception {
        mvc.perform(post(Routes.Offers.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + p.getId() + "\",\"amount\":" + amount + "}"))
                .andExpect(status().isCreated());
    }

    @Test
    void offersOnMine_verifiedBuyer_carriesTheBadgeDespiteTheMaskedMobile() throws Exception {
        User owner = user("9861100001", "owner");
        User buyer = user("9861100002", "buyer");
        tenantProfile(buyer, true);
        Property p = listing(owner, "Verified buyer");

        submitOffer(buyer, p, 24000L);

        mvc.perform(get(Routes.Offers.ME).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].from.mobile").value("98XXXXX002"))
                .andExpect(jsonPath("$.content[0].from.verified").value(true));
    }

    @Test
    void offersOnMine_unverifiedBuyer_carriesNoBadge() throws Exception {
        User owner = user("9861100003", "owner");
        User buyer = user("9861100004", "buyer");
        tenantProfile(buyer, false);
        Property p = listing(owner, "Unverified buyer");

        submitOffer(buyer, p, 23000L);

        mvc.perform(get(Routes.Offers.ME).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].from.verified").value(false));
    }

    @Test
    void offersOnMine_buyerWithNoProfile_carriesNoBadge() throws Exception {
        User owner = user("9861100005", "owner");
        User buyer = user("9861100006", "buyer");
        Property p = listing(owner, "No profile");

        submitOffer(buyer, p, 22000L);

        mvc.perform(get(Routes.Offers.ME).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].from.verified").value(false));
    }

    @Test
    void finalizationStatus_verifiedInitiator_carriesTheBadgeDespiteTheMaskedMobile() throws Exception {
        User owner = user("9861100007", "owner");
        User buyer = user("9861100008", "buyer");
        tenantProfile(buyer, true);
        Property p = listing(owner, "Finalization verified");

        mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"counterpartyMobile\":\"" + owner.getMobile()
                                + "\",\"agreedPrice\":5000000}"))
                .andExpect(status().isOk());

        mvc.perform(get("/finalization/" + p.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.initiator.mobile").value("98XXXXX008"))
                .andExpect(jsonPath("$.initiator.verified").value(true))
                .andExpect(jsonPath("$.counterparty.verified").value(false));
    }

    @Test
    void finalizationStatus_unverifiedInitiator_carriesNoBadge() throws Exception {
        User owner = user("9861100009", "owner");
        User buyer = user("9861100010", "buyer");
        tenantProfile(buyer, false);
        Property p = listing(owner, "Finalization unverified");

        mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"counterpartyMobile\":\"" + owner.getMobile()
                                + "\",\"agreedPrice\":5000000}"))
                .andExpect(status().isOk());

        mvc.perform(get("/finalization/" + p.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.initiator.verified").value(false));
    }
}

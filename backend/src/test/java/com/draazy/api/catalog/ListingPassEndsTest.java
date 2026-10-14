package com.draazy.api.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.TestPlanGrants;
import com.draazy.api.catalog.listing.ListingArchiveService;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.deals.deal.DealCloseRequest;
import com.draazy.api.deals.deal.DealService;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("A listing pass ends with the listing it covers")
class ListingPassEndsTest extends AbstractApiTest {

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired TestPlanGrants grants;
    @Autowired ListingArchiveService archiveService;
    @Autowired DealService dealService;

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Pass end " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property live(User owner) {
        Property p = new Property(owner, "Covered flat", "rent", "apartment", 25000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("900"));
        p.setStatus("approved");
        return properties.saveAndFlush(p);
    }

    private String statusOf(Subscription pass) {
        return jdbc.queryForObject("select status from subscriptions where id = ?", String.class, pass.getId());
    }

    private void assertPassGone(User owner, Property p, Subscription pass) throws Exception {
        assertThat(statusOf(pass)).isEqualTo("expired");
        assertThat(properties.hasActivePass(p.getId(), Instant.now())).isFalse();
        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header("Authorization", bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings.passes.length()").value(0));
    }

    @Test
    @DisplayName("the owner taking the listing down ends its pass, and restoring it does not bring the pass back")
    void ownerArchiveEndsThePass() throws Exception {
        User o = owner("9861700001");
        Property p = live(o);
        Subscription pass = grants.grantPass(o.getId(), p.getId(), Instant.now().plus(60, ChronoUnit.DAYS));

        mvc.perform(delete("/me/listings/" + p.getId()).header("Authorization", bearer(o)))
                .andExpect(status().isOk());
        assertPassGone(o, p, pass);

        archiveService.restore(new AuthPrincipal(o.getId(), "owner", null, true, false), p.getId().toString());
        assertThat(properties.hasActivePass(p.getId(), Instant.now())).isFalse();
    }

    @Test
    @DisplayName("an archive through the shared owner-or-staff service ends the pass too")
    void archiveServiceEndsThePass() throws Exception {
        User o = owner("9861700002");
        Property p = live(o);
        Subscription pass = grants.grantPass(o.getId(), p.getId(), Instant.now().plus(60, ChronoUnit.DAYS));

        archiveService.archive(new AuthPrincipal(o.getId(), "owner", null, true, false),
                p.getId().toString(), "duplicate");

        assertPassGone(o, p, pass);
    }

    @Test
    @DisplayName("closing the deal ends the pass, and reopening the deal does not bring it back")
    void closingTheDealEndsThePass() throws Exception {
        User o = owner("9861700003");
        Property p = live(o);
        Subscription pass = grants.grantPass(o.getId(), p.getId(), Instant.now().plus(60, ChronoUnit.DAYS));

        dealService.close(o.getId(), p.getId(), new DealCloseRequest(25000L, "9861700099", null));
        assertPassGone(o, p, pass);

        dealService.reopen(new AuthPrincipal(o.getId(), "owner", null, true, false), p.getId(), null);
        assertThat(properties.hasActivePass(p.getId(), Instant.now())).isFalse();
    }

    @Test
    @DisplayName("another listing's pass is left alone")
    void otherPassesSurvive() throws Exception {
        User o = owner("9861700004");
        Property gone = live(o);
        Property kept = live(o);
        grants.grantPass(o.getId(), gone.getId(), Instant.now().plus(60, ChronoUnit.DAYS));
        grants.grantPass(o.getId(), kept.getId(), Instant.now().plus(60, ChronoUnit.DAYS));

        mvc.perform(delete("/me/listings/" + gone.getId()).header("Authorization", bearer(o)))
                .andExpect(status().isOk());

        assertThat(properties.hasActivePass(kept.getId(), Instant.now())).isTrue();
        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header("Authorization", bearer(o)))
                .andExpect(jsonPath("$.listings.passes.length()").value(1))
                .andExpect(jsonPath("$.listings.passes[0].propertyId").value(kept.getId().toString()));
    }
}

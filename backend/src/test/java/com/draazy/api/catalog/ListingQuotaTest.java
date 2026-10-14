package com.draazy.api.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.TestPlanGrants;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

// The free tier is one live listing; posting is unlimited and the gate is going live (approval and resume).
@DisplayName("Listing quota — the ceiling the browser used to keep")
class ListingQuotaTest extends AbstractApiTest {

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired TestPlanGrants grants;

    private static final String BODY = """
            {"title":"%s","deal":"rent","propertyType":"apartment","price":25000,
             "locality":"Kothrud","city":"Pune",%s}
            """;

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Quota " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    // A listing already in the catalogue, saved directly.
    // That is also what "posted from another device" means here.
    private Property existing(User owner, String title, String status) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setStatus(status);
        return properties.saveAndFlush(p);
    }

    private int tryPost(User owner, String title) throws Exception {
        return mvc.perform(post("/me/listings").header("Authorization", bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.formatted(title, listingImages(owner))))
                .andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("posting never refuses on the free tier — the gate is going live, not being created")
    void aSecondListingCanBePosted() throws Exception {
        User o = owner("9861000001");
        existing(o, "Posted from the laptop", PropertyStatus.APPROVED);

        assertThat(tryPost(o, "Posted from the phone")).isEqualTo(201);
    }

    @Test
    @DisplayName("a second listing cannot resume while the first is live, and the refusal names the pass price")
    void resumeIsRefusedOverTheFreeTier() throws Exception {
        User o = owner("9861000002");
        existing(o, "Live flat", PropertyStatus.APPROVED);
        Property paused = existing(o, "Paused flat", PropertyStatus.PAUSED);

        mvc.perform(post(Routes.MeListings.RESUME.replace("{id}", paused.getId().toString()))
                        .header("Authorization", bearer(o)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("listing_quota_exhausted"))
                .andExpect(jsonPath("$.message").value(containsString("₹999")));
        assertThat(properties.findById(paused.getId()).orElseThrow().getStatus())
                .isEqualTo(PropertyStatus.PAUSED);
    }

    @Test
    @DisplayName("a listing pass on the paused listing lets it resume beside the free one")
    void aPassLetsTheSecondListingResume() throws Exception {
        User o = owner("9861000009");
        existing(o, "Live flat", PropertyStatus.APPROVED);
        Property paused = existing(o, "Paused flat", PropertyStatus.PAUSED);
        grants.grantPass(o.getId(), paused.getId(), Instant.now().plus(60, ChronoUnit.DAYS));

        mvc.perform(post(Routes.MeListings.RESUME.replace("{id}", paused.getId().toString()))
                        .header("Authorization", bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"));
    }

    @Test
    @DisplayName("an expired pass covers nothing")
    void anExpiredPassDoesNotCover() throws Exception {
        User o = owner("9861000014");
        existing(o, "Live flat", PropertyStatus.APPROVED);
        Property paused = existing(o, "Paused flat", PropertyStatus.PAUSED);
        grants.grantPass(o.getId(), paused.getId(), Instant.now().minus(1, ChronoUnit.DAYS));

        mvc.perform(post(Routes.MeListings.RESUME.replace("{id}", paused.getId().toString()))
                        .header("Authorization", bearer(o)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("pausing the live listing frees the free slot for the other one")
    void pausingFreesTheSlot() throws Exception {
        User o = owner("9861000015");
        Property live = existing(o, "Live flat", PropertyStatus.APPROVED);
        Property paused = existing(o, "Paused flat", PropertyStatus.PAUSED);

        mvc.perform(post(Routes.MeListings.PAUSE.replace("{id}", live.getId().toString()))
                        .header("Authorization", bearer(o)))
                .andExpect(status().isOk());
        mvc.perform(post(Routes.MeListings.RESUME.replace("{id}", paused.getId().toString()))
                        .header("Authorization", bearer(o)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a rejected listing costs nothing — a moderator cannot spend an owner's allowance")
    void rejectedDoesNotCountTowardsTheCeiling() throws Exception {
        User o = owner("9861000003");
        existing(o, "Turned down", PropertyStatus.REJECTED);

        assertThat(tryPost(o, "Second attempt")).isEqualTo(201);
    }

    @Test
    @DisplayName("entitlements count only live listings a pass does not cover, and list the passes")
    void entitlementsReportTheHeldCount() throws Exception {
        User o = owner("9861000010");
        existing(o, "Live", PropertyStatus.APPROVED);
        existing(o, "Flagged", PropertyStatus.FLAGGED);
        existing(o, "Queued", PropertyStatus.PENDING);
        existing(o, "Paused", PropertyStatus.PAUSED);
        existing(o, "Turned down", PropertyStatus.REJECTED);
        Property covered = existing(o, "Covered", PropertyStatus.APPROVED);
        Property gone = existing(o, "Taken down", PropertyStatus.APPROVED);
        mvc.perform(delete("/me/listings/" + gone.getId()).header("Authorization", bearer(o)))
                .andExpect(status().isOk());
        grants.grantPass(o.getId(), covered.getId(), Instant.now().plus(60, ChronoUnit.DAYS));

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header("Authorization", bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings.used").value(2))
                .andExpect(jsonPath("$.listings.allowance").value(1))
                .andExpect(jsonPath("$.listings.passes.length()").value(1))
                .andExpect(jsonPath("$.listings.passes[0].propertyId").value(covered.getId().toString()));
    }

    @Test
    @DisplayName("the wizard's quota read gives the caller's own allowance and live count, nothing else")
    void theQuotaReadMatchesEntitlementsAndIsScopedToTheCaller() throws Exception {
        User o = owner("9861000011");
        User other = owner("9861000012");
        existing(o, "Live", PropertyStatus.APPROVED);
        existing(o, "Turned down", PropertyStatus.REJECTED);
        existing(other, "Theirs one", PropertyStatus.APPROVED);
        existing(other, "Theirs two", PropertyStatus.FLAGGED);

        mvc.perform(get(Routes.MeListings.QUOTA).header("Authorization", bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.used").value(1))
                .andExpect(jsonPath("$.allowance").isNumber())
                .andExpect(jsonPath("$.contacts").doesNotExist())
                .andExpect(jsonPath("$.listings").doesNotExist());
        mvc.perform(get(Routes.MeListings.QUOTA).header("Authorization", bearer(other)))
                .andExpect(jsonPath("$.used").value(2));
        mvc.perform(get(Routes.MeListings.QUOTA)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("create, edit and take-down answer the identity and verdict, not the whole record")
    void writesAnswerAWriteResult() throws Exception {
        User o = owner("9861000013");
        String created = mvc.perform(post("/me/listings").header("Authorization", bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.formatted("Slim write", listingImages(o))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isString())
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.recheckPending").value(false))
                .andExpect(jsonPath("$.archived").doesNotExist())
                .andExpect(jsonPath("$.title").doesNotExist())
                .andExpect(jsonPath("$.owner").doesNotExist())
                .andExpect(jsonPath("$.images").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String id = com.jayway.jsonpath.JsonPath.read(created, "$.id");

        mvc.perform(patch("/me/listings/" + id).header("Authorization", bearer(o))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"description\":\"New copy\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.status").value("pending"))
                .andExpect(jsonPath("$.description").doesNotExist())
                .andExpect(jsonPath("$.owner").doesNotExist());

        mvc.perform(delete("/me/listings/" + id).header("Authorization", bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.archived").value(true))
                .andExpect(jsonPath("$.description").doesNotExist())
                .andExpect(jsonPath("$.owner").doesNotExist());
    }

    @Test
    @DisplayName("a refused resume leaves the listing as it was")
    void aRefusedResumeChangesNothing() throws Exception {
        User o = owner("9861000005");
        existing(o, "The only live one", PropertyStatus.APPROVED);
        Property paused = existing(o, "Still paused", PropertyStatus.PAUSED);

        mvc.perform(post(Routes.MeListings.RESUME.replace("{id}", paused.getId().toString()))
                        .header("Authorization", bearer(o)))
                .andExpect(status().isUnprocessableEntity());
        assertThat(properties.findAll().stream().filter(p -> p.getId().equals(paused.getId()))
                .map(Property::getStatus)).containsExactly(PropertyStatus.PAUSED);
    }

    @Test
    @DisplayName("a fourth post inside a day is refused even though no slot is held")
    void theDailyPaceBindsWhereTheCeilingCannot() throws Exception {
        User o = owner("9861400001");
        for (int i = 0; i < 3; i++) {
            existing(o, "Turned down " + i, PropertyStatus.REJECTED);
        }

        mvc.perform(post("/me/listings").header("Authorization", bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY.formatted("Fourth today", listingImages(o))))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"))
                .andExpect(jsonPath("$.message").value(containsString("3 new listings a day")));
    }

    @Test
    @DisplayName("deleting listings does not reset the daily pace")
    void deletingDoesNotResetThePace() throws Exception {
        User o = owner("9861400002");
        for (int i = 0; i < 3; i++) {
            mvc.perform(delete("/me/listings/" + existing(o, "Posted and pulled " + i, PropertyStatus.APPROVED).getId())
                            .header("Authorization", bearer(o)))
                    .andExpect(status().isOk());
        }

        assertThat(tryPost(o, "Fourth today")).isEqualTo(429);
    }

    @Test
    @DisplayName("taking down someone else's listing is a 404, not a 403")
    void takeDownIsOwnerScoped() throws Exception {
        User mine = owner("9861000006");
        User theirs = owner("9861000007");
        Property p = existing(theirs, "Not yours", PropertyStatus.APPROVED);

        mvc.perform(delete("/me/listings/" + p.getId()).header("Authorization", bearer(mine)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("taking down twice is not an error — the caller asked for a state, not an event")
    void takeDownIsIdempotent() throws Exception {
        User o = owner("9861000008");
        Property p = existing(o, "Gone", PropertyStatus.APPROVED);

        mvc.perform(delete("/me/listings/" + p.getId()).header("Authorization", bearer(o)))
                .andExpect(status().isOk());
        mvc.perform(delete("/me/listings/" + p.getId()).header("Authorization", bearer(o)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.archived").value(true));
    }
}

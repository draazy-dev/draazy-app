package com.draazy.api.catalog;

import com.draazy.api.support.AbstractApiTest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class OwnerProfileTest extends AbstractApiTest {
    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @Autowired
    EntityManager em;

    private static final String SLUG = "owner-profile-fixture";

    @BeforeEach
    void createFixtureLocality() {
        jdbc.update("insert into localities (slug, name, city) values (?, ?, 'Pune')"
                + " on conflict (slug) do nothing", SLUG, "Owner Profile Fixture");
    }

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Asha Patil");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String title, String status) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setLocalitySlug(SLUG);
        p.setStatus(status);
        return properties.saveAndFlush(p);
    }

    @Test
    void theSellerCardIsPublicAndCappedToSixFields() throws Exception {
        User u = owner("9811000001");
        mvc.perform(get("/owners/" + u.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").doesNotExist())
                .andExpect(jsonPath("$.name").value("Asha Patil"))
                .andExpect(jsonPath("$.mobile").exists())
                .andExpect(jsonPath("$.verified").exists())
                .andExpect(jsonPath("$.listingCount").exists())
                .andExpect(jsonPath("$.*", org.hamcrest.Matchers.hasSize(6)));
    }

    @Test
    void theCardCarriesNothingOperationalAboutTheAccount() throws Exception {
        User u = owner("9811000002");
        u.setEmail("asha@example.com");
        users.saveAndFlush(u);

        mvc.perform(get("/owners/" + u.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.role").doesNotExist())
                .andExpect(jsonPath("$.status").doesNotExist())
                .andExpect(jsonPath("$.team").doesNotExist())
                .andExpect(jsonPath("$.lastActive").doesNotExist())
                .andExpect(jsonPath("$.flagged").doesNotExist())
                .andExpect(jsonPath("$.identityVerified").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void theMobileIsMaskedWithNoWayToRevealIt() throws Exception {
        User u = owner("9811000003");
        mvc.perform(get("/owners/" + u.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mobile").value("98XXXXX003"))
                .andExpect(jsonPath("$.mobile").value(org.hamcrest.Matchers.not("9811000003")));
    }

    @Test
    void memberSinceIsTheYearReadInIndianTime() throws Exception {
        User u = owner("9811000004");
        Instant justAfterMidnightIst = Instant.parse("2023-12-31T19:00:00Z");
        jdbc.update("update users set joined_at = ? where id = ?",
                java.sql.Timestamp.from(justAfterMidnightIst), u.getId());
        em.clear();

        mvc.perform(get("/owners/" + u.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.memberSince").value(2024))
                .andExpect(jsonPath("$.memberSince")
                        .value(org.hamcrest.Matchers.not(justAfterMidnightIst.atZone(ZoneId.of("UTC")).getYear())));
    }

    @Test
    void theListingCountCountsOnlyWhatAVisitorCanOpen() throws Exception {
        User u = owner("9811000005");
        listing(u, "Live one", PropertyStatus.APPROVED);
        Property dormant = listing(u, "Dormant real listing", PropertyStatus.APPROVED);
        jdbc.update("update properties set created_at = ? where id = ?",
                java.sql.Timestamp.from(Instant.now().minus(32, ChronoUnit.DAYS)), dormant.getId());
        listing(u, "Still pending", "pending");
        Property archived = listing(u, "Taken down", PropertyStatus.APPROVED);
        archived.archive("rented out");
        properties.saveAndFlush(archived);

        mvc.perform(get("/owners/" + u.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listingCount").value(1));
    }

    @Test
    void anOwnerWithNoLiveListingsAnswersZero() throws Exception {
        User u = owner("9811000006");
        mvc.perform(get("/owners/" + u.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listingCount").value(0));
    }

    @Test
    void unknownMalformedAndArchivedOwnersAreAllTheSameNotFound() throws Exception {
        mvc.perform(get("/owners/" + UUID.randomUUID())).andExpect(status().isNotFound());
        mvc.perform(get("/owners/not-a-uuid-at-all")).andExpect(status().isNotFound());

        User u = owner("9811000007");
        u.archive("account closed");
        users.saveAndFlush(u);
        mvc.perform(get("/owners/" + u.getId())).andExpect(status().isNotFound());
    }

    @Test
    void thereIsNoPublicListOfOwners() throws Exception {
        mvc.perform(get("/owners")).andExpect(status().is4xxClientError());
    }

    @Test
    void theOwnerFacetNarrowsToOnePerson() throws Exception {
        User mine = owner("9811000008");
        User theirs = owner("9811000009");
        listing(mine, "Mine and live", PropertyStatus.APPROVED);
        listing(theirs, "Theirs and live", PropertyStatus.APPROVED);

        mvc.perform(get("/properties").param("owner", mine.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].title",
                        org.hamcrest.Matchers.hasItem("Mine and live")))
                .andExpect(jsonPath("$.content[*].title",
                        org.hamcrest.Matchers.not(org.hamcrest.Matchers.hasItem("Theirs and live"))));
    }

    @Test
    void askingForOneOwnersStockStillHidesWhatIsNotPublic() throws Exception {
        User u = owner("9811000010");
        listing(u, "Owner facet live", PropertyStatus.APPROVED);
        listing(u, "Owner facet pending", "pending");
        Property archived = listing(u, "Owner facet archived", PropertyStatus.APPROVED);
        archived.archive("rented out");
        properties.saveAndFlush(archived);

        mvc.perform(get("/properties").param("owner", u.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", org.hamcrest.Matchers.hasSize(1)))
                .andExpect(jsonPath("$.content[0].title").value("Owner facet live"));
    }

    @Test
    void aMalformedOwnerFacetMatchesNothingRatherThanFailing() throws Exception {
        mvc.perform(get("/properties").param("owner", "u1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", org.hamcrest.Matchers.hasSize(0)));
    }
}

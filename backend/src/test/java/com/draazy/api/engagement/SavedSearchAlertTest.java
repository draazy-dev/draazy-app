package com.draazy.api.engagement;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.engagement.search.SavedSearch;
import com.draazy.api.engagement.search.SavedSearchCreateRequest;
import com.draazy.api.engagement.search.SavedSearchRepository;
import com.draazy.api.engagement.search.SavedSearchResponse;
import com.draazy.api.engagement.search.SavedSearchService;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;

// The cadence, not just the send, is under test: "Daily" fired every sweep would break the user's choice.
// Alerts are counted via jdbc so the assertion is about what reached the table.
@DisplayName("D94 - saved-search alerts are actually sent")
class SavedSearchAlertTest extends AbstractApiTest {

    /** The BHK no seeded or inline listing outside this test uses, so counts cannot drift. */
    private static final String ODD_BHK = "97";

    /** Matches the locality this test inserts, and nothing else. */
    private static final String LOCALITY = "d94-alert-locality";

    @Autowired
    SavedSearchService savedSearches;

    @Autowired
    SavedSearchRepository searches;

    @Autowired
    UserRepository users;

    @Autowired
    PropertyRepository properties;

    @Autowired
    EntityManager em;

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Owner " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private void locality() {
        jdbc.update("""
                insert into localities (slug, name, city, active)
                values (?, ?, ?, true)
                on conflict (slug) do nothing
                """, LOCALITY, "D94 Alert Locality", "Pune");
    }

    // Baseline pinned so only listings created after this call can match.
    private SavedSearch alertFor(User user, String frequency) {
        SavedSearch search = new SavedSearch(user.getId(), "rent " + LOCALITY);
        search.setFilters("{\"deal\":\"rent\",\"localities\":[\"" + LOCALITY
                + "\"],\"bhk\":[" + ODD_BHK + "]}");
        search.setAlertFrequency(frequency);
        search = searches.saveAndFlush(search);
        jdbc.update("update saved_searches set updated_at = ? where id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), search.getId());
        return search;
    }

    private void listing(User user, String title) {
        Property p = new Property(user, title, "rent", "apartment", 31000L,
                "D94 Alert Locality", "Pune");
        p.setLocalitySlug(LOCALITY);
        p.setBhk(new BigDecimal(ODD_BHK));
        p.setStatus("approved");
        properties.saveAndFlush(p);
    }

    private int alertsFor(User user) {
        Integer n = jdbc.queryForObject(
                "select count(*) from notifications where user_id = ? and type = 'match.saved-search'",
                Integer.class, user.getId());
        return n == null ? 0 : n;
    }

    @Test
    @DisplayName("a rise in matches notifies the owner and stamps last_alerted_at")
    void aRiseNotifiesTheOwner() {
        User user = owner("9820940001");
        locality();
        SavedSearch search = alertFor(user, "daily");
        listing(user, "D94 first match");
        em.flush();
        em.clear();

        savedSearches.recomputeNewCounts(Instant.now());

        assertThat(alertsFor(user)).isEqualTo(1);
        SavedSearch after = searches.findById(search.getId()).orElseThrow();
        assertThat(after.getNewCount()).isEqualTo(1);
        assertThat(after.getLastAlertedAt()).isNotNull();
    }

    @Test
    @DisplayName("alertFrequency 'off' means off, however many homes appear")
    void offMeansOff() {
        User user = owner("9820940002");
        locality();
        SavedSearch search = alertFor(user, "off");
        listing(user, "D94 unwanted match");
        em.flush();
        em.clear();

        savedSearches.recomputeNewCounts(Instant.now());

        // The count is still maintained -- the badge on the card is not an alert, and a user who
        // turned alerts off has not asked to stop seeing what is there when they visit.
        SavedSearch after = searches.findById(search.getId()).orElseThrow();
        assertThat(after.getNewCount()).isEqualTo(1);
        assertThat(after.getLastAlertedAt()).isNull();
        assertThat(alertsFor(user)).isZero();
    }

    // The sweep runs every thirty minutes; a daily alert must survive 48 of them without sending twice.
    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "twenty minutes later it does not fire twice in a day | 20 | 1",
            "a day later the cadence has elapsed so it fires again | 1500 | 2"
    })
    @DisplayName("daily is measured from the last alert, even as more homes arrive")
    void dailyCadenceIsMeasuredFromTheLastAlert(String label, long minutesLater, int expectedAlerts) {
        User user = owner("9820940003");
        locality();
        SavedSearch search = alertFor(user, "daily");
        listing(user, "D94 first match");
        em.flush();
        em.clear();

        savedSearches.recomputeNewCounts(Instant.now());
        assertThat(alertsFor(user)).isEqualTo(1);

        // A second wave, and a second sweep.
        jdbc.update("update saved_searches set updated_at = ? where id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), search.getId());
        listing(user, "D94 second match");
        em.flush();
        em.clear();

        savedSearches.recomputeNewCounts(Instant.now().plus(minutesLater, ChronoUnit.MINUTES));

        assertThat(alertsFor(user))
                .as("daily must not become half-hourly just because inventory moved")
                .isEqualTo(expectedAlerts);
    }

    // The count drops to zero the tick after an alert because the baseline moves with updated_at; not news.
    @Test
    @DisplayName("a falling count never notifies")
    void aFallingCountIsSilent() {
        User user = owner("9820940005");
        locality();
        alertFor(user, "instant");
        listing(user, "D94 only match");
        em.flush();
        em.clear();

        savedSearches.recomputeNewCounts(Instant.now());
        assertThat(alertsFor(user)).isEqualTo(1);

        // No new inventory. The baseline has advanced, so the count falls back to zero.
        savedSearches.recomputeNewCounts(Instant.now().plus(1, ChronoUnit.HOURS));

        assertThat(alertsFor(user))
                .as("the count falling from 1 to 0 is not an event")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("flatmate newCount excludes profiles older than the alert baseline")
    void flatmateSweepCountsOnlyNewRows() {
        User user = owner("9820940006");
        SavedSearchResponse created = savedSearches.create(user.getId(),
                new SavedSearchCreateRequest("Old flatmate alert", "flatmates", null, null,
                        Map.of("tab", "team-up", "locality", "D94 Flatmate Town",
                                "budgetMin", 10000, "budget", 20000,
                                "gender", "female"),
                        null, null));
        Instant baseline = Instant.now().minusSeconds(60);
        jdbc.update("update saved_searches set updated_at = ? where id = ?::uuid",
                Timestamp.from(baseline), created.id());
        jdbc.update("""
                insert into flatmate_seeker_posts
                    (user_id, name, gender, budget, localities, mod_status, created_at)
                values (?, 'Old Seeker', 'female', 18000, '[\"D94 Flatmate Town\"]'::jsonb,
                    'approved', ?)
                """, user.getId(), Timestamp.from(baseline.minusSeconds(86_400)));
        em.flush();
        em.clear();

        savedSearches.recomputeNewCounts(Instant.now());

        SavedSearch after = searches.findById(java.util.UUID.fromString(created.id())).orElseThrow();
        assertThat(after.getNewCount()).isZero();
        assertThat(alertsFor(user)).isZero();
    }
}

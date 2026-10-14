package com.draazy.api.billing.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

/** A paid plan stops working when its term ends, on the clock rather than the sweep; the sweep is proved separately. */
@DisplayName("Subscription lifecycle — a term that ends, ends")
class SubscriptionLifecycleTest extends AbstractApiTest {

    /** Owner Plus, priced. Any plan id serves; nothing here reads the plan's own fields. */
    private static final String PAID_PLAN = "b1000000-0000-4000-8000-000000000002";

    private static final Instant NOW = Instant.parse("2026-06-01T00:00:00Z");
    private static final Instant LAST_MONTH = NOW.minus(30, ChronoUnit.DAYS);
    private static final Instant NEXT_MONTH = NOW.plus(30, ChronoUnit.DAYS);

    @Autowired UserRepository users;
    @Autowired SubscriptionRepository subscriptions;

    @Autowired PlanRepository plans;
    @Autowired com.draazy.api.catalog.property.PropertyRepository properties;
    @Autowired SubscriptionSweeper sweeper;

    private User subscriber(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Plan Holder " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    /** A subscription in whatever state the test needs, dated however it needs. */
    private Subscription subscription(User owner, String status, Instant startedAt, Instant renewsAt) {
        UUID planId = UUID.fromString(PAID_PLAN);
        // The plan's own price, read rather than written out, so a reprice cannot leave a literal
        // here claiming a subscription was sold for something it never cost.
        long price = plans.findById(planId).orElseThrow().getPrice();
        return subscriptions.saveAndFlush(new Subscription(owner.getId(),
                planId, null, status, price, startedAt, renewsAt, null, null));
    }

    // ---- 1: the sweep ends what has run out, and only what has run out ----

    @Test
    void theSweepExpiresATermThatHasRunOut() {
        User u = subscriber("9876540001");
        Subscription lapsed = subscription(u, SubscriptionStatuses.ACTIVE, LAST_MONTH, NOW.minus(1, ChronoUnit.DAYS));

        assertThat(sweeper.expireLapsed(NOW)).isEqualTo(1);
        assertThat(subscriptions.findById(lapsed.getId()).orElseThrow().getStatus())
                .isEqualTo(SubscriptionStatuses.EXPIRED);
        // Idempotent, which is what makes it safe to run on a timer and safe to run twice if two
        // instances ever overlap.
        assertThat(sweeper.expireLapsed(NOW)).isZero();
    }

    static Stream<Arguments> subscriptionsTheSweepLeavesAlone() {
        Instant yesterday = NOW.minus(1, ChronoUnit.DAYS);
        return Stream.of(
                Arguments.of("a term still running", SubscriptionStatuses.ACTIVE, NOW, NEXT_MONTH),
                // renewsAt is null on a pending row by construction; expiring one would destroy an
                // order the buyer may still be paying for.
                Arguments.of("a pending order, which has no term because no money has arrived",
                        SubscriptionStatuses.PENDING, LAST_MONTH, null),
                // Why it ended is a fact worth keeping.
                Arguments.of("a cancelled subscription, which keeps saying cancelled",
                        SubscriptionStatuses.CANCELLED, LAST_MONTH, yesterday));
    }

    @ParameterizedTest(name = "{0} is left alone")
    @MethodSource("subscriptionsTheSweepLeavesAlone")
    void theSweepLeavesAlone(String description, String status, Instant startedAt, Instant renewsAt) {
        User u = subscriber("9876540002");
        Subscription row = subscription(u, status, startedAt, renewsAt);

        assertThat(sweeper.expireLapsed(NOW)).isZero();
        assertThat(subscriptions.findById(row.getId()).orElseThrow().getStatus()).isEqualTo(status);
    }

    @Test
    @DisplayName("the renewal instant belongs to the next term, so a subscription is over the moment it arrives")
    void theBoundaryIsInclusive() {
        User u = subscriber("9876540006");
        subscription(u, SubscriptionStatuses.ACTIVE, LAST_MONTH, NOW);

        assertThat(sweeper.expireLapsed(NOW)).isEqualTo(1);
    }

    // ---- 1b: a lapsed listing pass pauses the listing it covered, unless the free slot has room ----

    private Property listing(User owner, String status) {
        Property p = new Property(owner, "Pass flat", "rent", "apartment", 25000L, "Baner", "Pune");
        p.setBhk(new java.math.BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new java.math.BigDecimal("900"));
        p.setStatus(status);
        return properties.saveAndFlush(p);
    }

    private void lapsedPass(User owner, Property covered) {
        subscriptions.saveAndFlush(new Subscription(owner.getId(),
                UUID.fromString("b1000000-0000-4000-8000-000000000005"), covered.getId(),
                SubscriptionStatuses.ACTIVE, 999L, LAST_MONTH, NOW.minus(1, ChronoUnit.DAYS), null, null));
    }

    @Test
    @DisplayName("a lapsed pass pauses its listing when another live listing holds the free slot")
    void aLapsedPassPausesTheListingOverTheFreeTier() {
        User u = subscriber("9876540011");
        listing(u, PropertyStatus.APPROVED);
        Property covered = listing(u, PropertyStatus.APPROVED);
        lapsedPass(u, covered);

        assertThat(sweeper.expireLapsed(NOW)).isEqualTo(1);

        assertThat(properties.findById(covered.getId()).orElseThrow().getStatus())
                .isEqualTo(PropertyStatus.PAUSED);
    }

    @Test
    @DisplayName("a lapsed pass leaves the listing live when it is the owner's only live one")
    void aLapsedPassKeepsTheOnlyLiveListing() {
        User u = subscriber("9876540012");
        Property only = listing(u, PropertyStatus.APPROVED);
        lapsedPass(u, only);

        assertThat(sweeper.expireLapsed(NOW)).isEqualTo(1);

        assertThat(properties.findById(only.getId()).orElseThrow().getStatus())
                .isEqualTo(PropertyStatus.APPROVED);
    }

    @Test
    @DisplayName("a lapsed legacy plan keeps the oldest live listing and pauses the rest, except pass-covered ones")
    void aLapsedPlanReappliesTheFreeTier() {
        User u = subscriber("9876540013");
        Property oldest = listing(u, PropertyStatus.APPROVED);
        Property newer = listing(u, PropertyStatus.APPROVED);
        Property covered = listing(u, PropertyStatus.APPROVED);
        jdbc.update("update properties set created_at = now() - interval '5 days' where id = ?", oldest.getId());
        subscriptions.saveAndFlush(new Subscription(u.getId(),
                UUID.fromString("b1000000-0000-4000-8000-000000000005"), covered.getId(),
                SubscriptionStatuses.ACTIVE, 999L, NOW, NEXT_MONTH, null, null));
        subscription(u, SubscriptionStatuses.ACTIVE, LAST_MONTH, NOW.minus(1, ChronoUnit.DAYS));

        assertThat(sweeper.expireLapsed(NOW)).isEqualTo(1);
        properties.flush();
        jdbc.query("select id, status from properties where owner_id = ?", rs -> {
            String expected = rs.getString("id").equals(newer.getId().toString())
                    ? PropertyStatus.PAUSED : PropertyStatus.APPROVED;
            assertThat(rs.getString("status")).isEqualTo(expected);
        }, u.getId());
    }

    @Test
    @DisplayName("a lapsed legacy plan leaves an owner already within the free tier alone")
    void aLapsedPlanKeepsAnOwnerWithinTheFreeTier() {
        User u = subscriber("9876540014");
        Property only = listing(u, PropertyStatus.APPROVED);
        subscription(u, SubscriptionStatuses.ACTIVE, LAST_MONTH, NOW.minus(1, ChronoUnit.DAYS));

        assertThat(sweeper.expireLapsed(NOW)).isEqualTo(1);

        assertThat(properties.findById(only.getId()).orElseThrow().getStatus())
                .isEqualTo(PropertyStatus.APPROVED);
    }

    // ---- 2: entitlement is decided against the clock, not against the sweep ----

    @Test
    @DisplayName("a lapsed plan stops entitling immediately — without waiting for the sweep to run")
    void alapsedPlanStopsEntitlingBeforeTheSweepRuns() throws Exception {
        User u = subscriber("9876540007");
        // Deliberately still `active` in the database, and expireLapsed is NOT called. This is the
        // gap a scheduler alone would leave open.
        subscription(u, SubscriptionStatuses.ACTIVE, LAST_MONTH, Instant.now().minusSeconds(60));

        mvc.perform(get(Routes.Plans.SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").doesNotExist())
                .andExpect(jsonPath("$.status").doesNotExist());
    }

    @Test
    @DisplayName("a lapsed plan does not hide a pending order the holder is trying to pay for")
    void aPendingOrderSurfacesOnceTheOldPlanHasLapsed() throws Exception {
        User u = subscriber("9876540009");
        subscription(u, SubscriptionStatuses.ACTIVE, LAST_MONTH, Instant.now().minusSeconds(60));
        subscription(u, SubscriptionStatuses.PENDING, Instant.now(), null);

        // The lapsed row is filtered out, so the renewal the user has already started is what they
        // are shown — rather than an empty document that reads as "your checkout vanished".
        mvc.perform(get(Routes.Plans.SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(SubscriptionStatuses.PENDING));
    }
}

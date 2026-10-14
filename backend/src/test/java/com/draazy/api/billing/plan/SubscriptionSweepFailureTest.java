package com.draazy.api.billing.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

import com.draazy.api.catalog.listing.ListingQuota;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@DisplayName("A pause that fails leaves its lapsed pass active, and the next sweep handles it")
class SubscriptionSweepFailureTest extends AbstractApiTest {

    private static final Instant NOW = Instant.parse("2026-06-01T00:00:00Z");

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired SubscriptionSweeper sweeper;
    @MockitoSpyBean ListingQuota quota;

    private Property listing(User owner) {
        Property p = new Property(owner, "Pass flat", "rent", "apartment", 25000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("900"));
        p.setStatus(PropertyStatus.APPROVED);
        return properties.saveAndFlush(p);
    }

    @Test
    void aFailedPauseIsRetriedOnTheNextSweep() {
        User u = new User("9876540021", "owner");
        u.setName("Sweep Owner");
        u.setMobileVerified(true);
        u = users.saveAndFlush(u);
        listing(u);
        Property covered = listing(u);
        Subscription pass = subscriptions.saveAndFlush(new Subscription(u.getId(),
                UUID.fromString("b1000000-0000-4000-8000-000000000005"), covered.getId(),
                SubscriptionStatuses.ACTIVE, 999L, NOW.minus(60, ChronoUnit.DAYS), NOW.minus(1, ChronoUnit.DAYS),
                null, null));
        doThrow(new IllegalStateException("lock timeout")).doCallRealMethod()
                .when(quota).mayGoLive(any(Property.class), any(Instant.class));

        assertThat(sweeper.expireLapsed(NOW)).isZero();
        assertThat(subscriptions.findById(pass.getId()).orElseThrow().getStatus())
                .isEqualTo(SubscriptionStatuses.ACTIVE);
        assertThat(properties.findById(covered.getId()).orElseThrow().getStatus())
                .isEqualTo(PropertyStatus.APPROVED);

        assertThat(sweeper.expireLapsed(NOW)).isEqualTo(1);
        assertThat(subscriptions.findById(pass.getId()).orElseThrow().getStatus())
                .isEqualTo(SubscriptionStatuses.EXPIRED);
        assertThat(properties.findById(covered.getId()).orElseThrow().getStatus())
                .isEqualTo(PropertyStatus.PAUSED);
    }
}

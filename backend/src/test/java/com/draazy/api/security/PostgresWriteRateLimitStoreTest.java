package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.AbstractCommittedApiTest;
import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;

@DisplayName("Postgres rate-limit store shares budgets across instances and redeploys")
class PostgresWriteRateLimitStoreTest extends AbstractCommittedApiTest {
    private static final Duration WINDOW = Duration.ofSeconds(60);
    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private RateLimitCounterRetention retention;

    private WriteRateLimitStore.Factory stores() {
        return RateLimitStoreConfig.storeFactory("postgres", null,
                RateLimitStoreConfig.postgres(jdbc, transactionManager));
    }

    @Override
    protected String mobilePrefix() {
        return "97915099";
    }

    @BeforeEach
    @AfterEach
    void clearCounters() {
        jdbc.update("DELETE FROM rate_limit_counters");
    }

    @Test
    @DisplayName("enforces the budget per caller and reports the time left in the window")
    void enforcesBudget() {
        WriteRateLimitStore store = stores().create("t-budget", 2, WINDOW);

        assertThat(store.tryAcquire("ip:1", NOW)).isZero();
        assertThat(store.tryAcquire("ip:1", NOW.plusSeconds(10))).isZero();
        assertThat(store.tryAcquire("ip:1", NOW.plusSeconds(20))).isEqualTo(40);
        assertThat(store.tryAcquire("ip:2", NOW.plusSeconds(20))).as("another caller").isZero();
    }

    @Test
    @DisplayName("a fresh instance, as after a redeploy, sees the hits already counted")
    void survivesANewInstance() {
        stores().create("t-deploy", 1, WINDOW).tryAcquire("ip:1", NOW);

        assertThat(stores().create("t-deploy", 1, WINDOW).tryAcquire("ip:1", NOW.plusSeconds(1)))
                .isPositive();
    }

    @Test
    @DisplayName("namespaces keep separate budgets for the same caller")
    void namespacesAreIsolated() {
        stores().create("t-a", 1, WINDOW).tryAcquire("ip:1", NOW);

        assertThat(stores().create("t-b", 1, WINDOW).tryAcquire("ip:1", NOW)).isZero();
    }

    @Test
    @DisplayName("starts a new window once the old one has ended")
    void resetsAfterTheWindow() {
        WriteRateLimitStore store = stores().create("t-reset", 1, WINDOW);
        store.tryAcquire("ip:1", NOW);
        assertThat(store.tryAcquire("ip:1", NOW.plusSeconds(30))).isPositive();

        assertThat(store.tryAcquire("ip:1", NOW.plus(WINDOW))).isZero();
    }

    @Test
    @DisplayName("never persists the raw key, which can be an IP or a mobile")
    void storesOnlyADigest() {
        stores().create("t-pii", 5, WINDOW).tryAcquire("9876543210", NOW);

        assertThat(jdbc.queryForList("SELECT bucket FROM rate_limit_counters", String.class))
                .singleElement()
                .satisfies(bucket -> assertThat(bucket).doesNotContain("9876543210").hasSize(64));
    }

    @Test
    @DisplayName("the retention job removes only windows that have ended")
    void retentionPurgesExpiredOnly() {
        Instant real = Instant.now();
        stores().create("t-old", 1, WINDOW).tryAcquire("ip:1", real.minus(Duration.ofMinutes(5)));
        stores().create("t-live", 1, WINDOW).tryAcquire("ip:1", real);

        assertThat(retention.purgeExpired()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM rate_limit_counters", Integer.class)).isEqualTo(1);
    }
}

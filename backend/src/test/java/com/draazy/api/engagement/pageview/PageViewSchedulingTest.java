package com.draazy.api.engagement.pageview;

import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

// Deliberately not @Transactional: a self-invoked write skips the proxy, so only with no ambient transaction to join
// does "No active transaction" surface, as when ReferralSignalRetention's expiry silently never ran.
@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Page view scheduled jobs")
class PageViewSchedulingTest {

    @Autowired PageViewRetention retention;
    @Autowired PageViewRollup rollup;

    @Test
    @DisplayName("expireNow() opens its own transaction, so the retention sweep can delete")
    void expireNowRunsInATransaction() {
        assertThatCode(() -> retention.expireNow())
                .as("the sweep calls expireNow() with no ambient transaction; without one of its "
                        + "own the DELETE fails and the thirty-day promise silently never runs")
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("rollUpNow() opens its own transaction, so the hourly job can write aggregates")
    void rollUpNowRunsInATransaction() {
        assertThatCode(() -> rollup.rollUpNow())
                .as("the job calls rollUpNow() with no ambient transaction; without one of its own "
                        + "every tick fails and the analytics charts quietly stop moving")
                .doesNotThrowAnyException();
    }
}

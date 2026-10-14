package com.draazy.api.engagement.pageview;

import com.draazy.api.common.PlatformTime;
import java.time.Instant;
import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Recomputes the identity-free daily aggregates every report reads over a trailing two-day IST window,
 * idempotently, so late browser batches and a view flushed just after midnight still land. */
@Component
public class PageViewRollup {

    private static final Logger log = LoggerFactory.getLogger(PageViewRollup.class);

    // Counting today. Public so a test asserts against the real window.
    public static final int RECOMPUTE_DAYS = 2;

    private final PageViewRepository repository;

    public PageViewRollup(PageViewRepository repository) {
        this.repository = repository;
    }

    // Clear-then-insert in one transaction, or a reader could see a day with no traffic between the two.
    @Transactional
    public int rollUpBetween(Instant fromInstant, Instant toInstant) {
        repository.clearDailyFrom(fromInstant);
        repository.clearDailyPathsFrom(fromInstant);
        repository.clearDailyReferrersFrom(fromInstant);
        int days = repository.rebuildDaily(fromInstant, toInstant);
        int paths = repository.rebuildDailyPaths(fromInstant, toInstant);
        int referrers = repository.rebuildDailyReferrers(fromInstant, toInstant);
        log.debug("Rolled up page views from {} to {}: {} day rows, {} path rows, {} referrer rows",
                fromInstant, toInstant, days, paths, referrers);
        return days + paths + referrers;
    }

    // Annotated itself: the self-call below skips the proxy, so without it the queries have no transaction.
    @Transactional
    public int rollUpNow() {
        Instant now = Instant.now();
        LocalDate from = LocalDate.ofInstant(now, PlatformTime.IST).minusDays(RECOMPUTE_DAYS - 1L);
        return rollUpBetween(from.atStartOfDay(PlatformTime.IST).toInstant(), now);
    }
}

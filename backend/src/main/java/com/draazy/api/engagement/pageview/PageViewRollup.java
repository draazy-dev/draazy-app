package com.draazy.api.engagement.pageview;

import com.draazy.api.common.PlatformTime;
import java.time.Instant;
import java.time.LocalDate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class PageViewRollup {
    private static final Logger log = LoggerFactory.getLogger(PageViewRollup.class);

    public static final int RECOMPUTE_DAYS = 2;

    private final PageViewRepository repository;

    public PageViewRollup(PageViewRepository repository) {
        this.repository = repository;
    }

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

    @Transactional
    public int rollUpNow() {
        Instant now = Instant.now();
        LocalDate from = LocalDate.ofInstant(now, PlatformTime.IST).minusDays(RECOMPUTE_DAYS - 1L);
        return rollUpBetween(from.atStartOfDay(PlatformTime.IST).toInstant(), now);
    }
}

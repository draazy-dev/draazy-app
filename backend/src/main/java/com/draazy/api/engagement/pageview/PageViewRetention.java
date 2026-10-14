package com.draazy.api.engagement.pageview;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Expires raw {@link PageView} rows (session/user ids) after thirty days; reports read only the
 * identity-free daily rollup, kept indefinitely, so expiry never changes an answer. */
@Component
public class PageViewRetention {

    private static final Logger log = LoggerFactory.getLogger(PageViewRetention.class);

    // Public so a test proves expiry against the real window, not a retyped copy that drifts.
    public static final Duration RETENTION = Duration.ofDays(30);

    private final PageViewRepository repository;

    public PageViewRetention(PageViewRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public int expirePageViewsOlderThan(Instant cutoff) {
        int removed = repository.deleteOlderThan(cutoff);
        if (removed > 0) {
            log.info("Expired {} raw page views recorded before {}", removed, cutoff);
        }
        return removed;
    }

    // Annotated itself: the self-call below skips the proxy, so without it the delete has no transaction.
    @Transactional
    public int expireNow() {
        return expirePageViewsOlderThan(Instant.now().minus(RETENTION));
    }
}

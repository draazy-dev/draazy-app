package com.draazy.api.engagement.pageview;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class PageViewRetention {
    private static final Logger log = LoggerFactory.getLogger(PageViewRetention.class);

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

    @Transactional
    public int expireNow() {
        return expirePageViewsOlderThan(Instant.now().minus(RETENTION));
    }
}

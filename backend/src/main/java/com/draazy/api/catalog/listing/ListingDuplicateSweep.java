package com.draazy.api.catalog.listing;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class ListingDuplicateSweep {
    private static final Logger log = LoggerFactory.getLogger(ListingDuplicateSweep.class);

    private static final Duration WINDOW = Duration.ofMinutes(30);

    private static final int MAX_PER_TICK = 500;

    private final ListingDuplicateProbe probe;

    public ListingDuplicateSweep(ListingDuplicateProbe probe) {
        this.probe = probe;
    }

    public int resweepRecentListings() {
        int scanned = probe.resweepRecent(Instant.now().minus(WINDOW), MAX_PER_TICK);
        if (scanned >= MAX_PER_TICK) {
            log.warn("Duplicate sweep hit its per-tick ceiling of {} listing(s); listings created"
                    + " in the last {} minutes may not all have been re-checked",
                    MAX_PER_TICK, WINDOW.toMinutes());
        }
        return scanned;
    }
}

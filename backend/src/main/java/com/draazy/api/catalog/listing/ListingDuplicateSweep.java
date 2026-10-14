package com.draazy.api.catalog.listing;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Re-runs the duplicate probe over recent listings: the in-transaction probe cannot see a sibling still
 * uncommitted, so two identical listings posted by a script in the same second miss each other. */
@Component
public class ListingDuplicateSweep {

    private static final Logger log = LoggerFactory.getLogger(ListingDuplicateSweep.class);

    // Twice the 15-minute FREQUENT period, so a tick lost to a crash or deploy still leaves one that reads it.
    private static final Duration WINDOW = Duration.ofMinutes(30);

    // A ceiling, not a page: hitting it means a flood. Oldest-first, so the overflow is still in the next window.
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

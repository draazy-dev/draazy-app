package com.draazy.api.common.payments;

import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class AbandonedCheckoutSweep {

    private static final Logger log = LoggerFactory.getLogger(AbandonedCheckoutSweep.class);

    private final List<AbandonedCheckouts> families;

    private final CheckoutTtl ttl;

    public AbandonedCheckoutSweep(List<AbandonedCheckouts> families, CheckoutTtl ttl) {
        this.families = families;
        this.ttl = ttl;
    }

    public int expireAbandonedCheckouts() {
        Instant cutoff = ttl.cutoffFrom(Instant.now());
        int expired = 0;
        for (AbandonedCheckouts family : families) {
            expired += sweep(family, cutoff);
        }
        return expired;
    }

    // Per-family handling keeps one broken expiry query from stopping the rest.
    private int sweep(AbandonedCheckouts family, Instant cutoff) {
        try {
            return family.expireAbandonedCheckouts(cutoff);
        } catch (RuntimeException e) {
            log.error("Checkout sweep failed for {}; will retry on the next tick", family.family(), e);
            return 0;
        }
    }
}

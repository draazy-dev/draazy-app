package com.draazy.api.leads.contact;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Daily timer for {@link ContactReturns}, kept separate so tests call the work with a fabricated instant. */
@Component
@ConditionalOnProperty(name = "draazy.leads.contact-return-sweep.enabled", havingValue = "true",
        matchIfMissing = true)
public class ContactReturnSweep {

    private static final Logger log = LoggerFactory.getLogger(ContactReturnSweep.class);

    private static final long EVERY_DAY_MS = 24L * 60L * 60L * 1000L;

    private static final long AFTER_STARTUP_MS = 10L * 60L * 1000L;

    private final ContactReturns returns;

    public ContactReturnSweep(ContactReturns returns) {
        this.returns = returns;
    }

    @Scheduled(fixedDelay = EVERY_DAY_MS, initialDelay = AFTER_STARTUP_MS)
    public void expireOverdueRequests() {
        try {
            int expired = returns.expireOverdue(Instant.now());
            if (expired > 0) {
                log.info("Contact sweep expired {} unanswered request(s)", expired);
            }
        } catch (RuntimeException e) {
            log.error("Contact sweep failed; will retry on the next tick", e);
        }
    }
}

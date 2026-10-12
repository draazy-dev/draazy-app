package com.draazy.api.billing.plan;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Timer for {@link SubscriptionSweeper}, kept separate so tests call the work directly with a fabricated instant. */
@Component
@ConditionalOnProperty(name = "draazy.billing.subscription-sweep.enabled",
        havingValue = "true", matchIfMissing = true)
public class SubscriptionSweep {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionSweep.class);

    private static final long EVERY_HOUR_MS = 60L * 60L * 1000L;

    // Not zero: startup is when the pool, Flyway and the context all contend.
    private static final long AFTER_STARTUP_MS = 5L * 60L * 1000L;

    private static final long REFUND_RETRY_MS = 5L * 60L * 1000L;

    private final SubscriptionSweeper subscriptions;

    public SubscriptionSweep(SubscriptionSweeper subscriptions) {
        this.subscriptions = subscriptions;
    }

    // fixedDelay so a slow sweep never overlaps itself.
    @Scheduled(fixedDelay = EVERY_HOUR_MS, initialDelay = AFTER_STARTUP_MS)
    public void expireLapsedSubscriptions() {
        try {
            int ended = subscriptions.expireLapsed(Instant.now());
            if (ended > 0) {
                log.info("Subscription sweep expired {} lapsed subscription(s)", ended);
            }
        } catch (RuntimeException e) {
            // An uncaught exception would cancel the schedule for the life of the process.
            log.error("Subscription sweep failed; will retry on the next tick", e);
        }
    }

    @Scheduled(fixedDelay = REFUND_RETRY_MS, initialDelay = AFTER_STARTUP_MS)
    public void sendDueRefunds() {
        try {
            int sent = subscriptions.sendDueRefunds();
            if (sent > 0) {
                log.info("Sent {} due listing-pass refund(s)", sent);
            }
        } catch (RuntimeException e) {
            log.error("Refund run failed; will retry on the next tick", e);
        }
    }
}

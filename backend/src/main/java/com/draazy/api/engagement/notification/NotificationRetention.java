package com.draazy.api.engagement.notification;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class NotificationRetention {

    private static final Logger log = LoggerFactory.getLogger(NotificationRetention.class);

    public static final Duration RETENTION = Duration.ofDays(90);

    /** Read rows are already hidden from the inbox after this window, so nothing visible is lost. */
    public static final Duration READ_RETENTION = NotificationService.READ_VISIBILITY;

    private final NotificationRepository repository;

    public NotificationRetention(NotificationRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public int purgeOlderThan(Instant cutoff, Instant readCutoff) {
        int removed = repository.deleteCreatedBefore(cutoff) + repository.deleteReadCreatedBefore(readCutoff);
        if (removed > 0) {
            log.info("Purged {} notifications (all before {}, read before {})", removed, cutoff, readCutoff);
        }
        return removed;
    }

    @Transactional
    public int purgeNow() {
        Instant now = Instant.now();
        return purgeOlderThan(now.minus(RETENTION), now.minus(READ_RETENTION));
    }
}

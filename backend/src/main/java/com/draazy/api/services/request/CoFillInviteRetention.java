package com.draazy.api.services.request;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Deletes unclaimed co-fill invitations: a number about someone who never registered and cannot ask for
 * erasure, and after ninety days TRAI may recycle it to a stranger who could then claim the invite. */
@Service
public class CoFillInviteRetention {

    /** The window, stated once. {@link CoFillParties#PENDING_INVITE_TTL} is where it is set. */
    public static final Duration RETENTION = CoFillParties.PENDING_INVITE_TTL;

    private static final Logger log = LoggerFactory.getLogger(CoFillInviteRetention.class);

    private final ServiceRequestPartyRepository parties;

    CoFillInviteRetention(ServiceRequestPartyRepository parties) {
        this.parties = parties;
    }

    // Annotated itself: the self-call below skips the proxy, so without it the delete has no transaction.
    @Transactional
    public long expireNow() {
        return expireInvitesOlderThan(Instant.now());
    }

    // Separate so a test proves the row behaviour without waiting ninety days.
    @Transactional
    public long expireInvitesOlderThan(Instant cutoff) {
        long deleted = parties.deleteByInviteExpiresAtBefore(cutoff);
        if (deleted > 0) {
            log.info("Expired {} unclaimed co-fill invitation(s) older than {}", deleted, cutoff);
        }
        return deleted;
    }
}

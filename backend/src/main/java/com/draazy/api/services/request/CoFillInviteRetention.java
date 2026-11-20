package com.draazy.api.services.request;

import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CoFillInviteRetention {
    public static final Duration RETENTION = CoFillParties.PENDING_INVITE_TTL;

    private static final Logger log = LoggerFactory.getLogger(CoFillInviteRetention.class);

    private final ServiceRequestPartyRepository parties;

    CoFillInviteRetention(ServiceRequestPartyRepository parties) {
        this.parties = parties;
    }

    @Transactional
    public long expireNow() {
        return expireInvitesOlderThan(Instant.now());
    }

    @Transactional
    public long expireInvitesOlderThan(Instant cutoff) {
        long deleted = parties.deleteByInviteExpiresAtBefore(cutoff);
        if (deleted > 0) {
            log.info("Expired {} unclaimed co-fill invitation(s) older than {}", deleted, cutoff);
        }
        return deleted;
    }
}

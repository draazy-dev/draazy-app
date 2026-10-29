package com.draazy.api.leads.contact;

import com.draazy.api.common.settings.PlatformSettings;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Component;

@Component
class ContactReplyWindow {
    private final PlatformSettings settings;

    ContactReplyWindow(PlatformSettings settings) {
        this.settings = settings;
    }

    Instant cutoff(Instant now) {
        return now.minus(Duration.ofDays(settings.contactReplyDays()));
    }

    Instant expiresAt(Instant createdAt) {
        return createdAt.plus(Duration.ofDays(settings.contactReplyDays()));
    }

    boolean lapsed(String status, Instant createdAt, Instant now) {
        return ContactRequestStatuses.EXPIRED.equals(status)
                || (ContactRequestStatuses.PENDING.equals(status) && createdAt != null
                        && createdAt.isBefore(cutoff(now)));
    }
}

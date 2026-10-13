package com.draazy.api.leads.contact;

import com.draazy.api.common.settings.PlatformSettings;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Component;

/** How long an owner has to answer a contact request before the seeker's contact is returned. */
@Component
class ContactReplyWindow {

    private final PlatformSettings settings;

    ContactReplyWindow(PlatformSettings settings) {
        this.settings = settings;
    }

    Instant cutoff(Instant now) {
        return now.minus(Duration.ofDays(settings.contactReplyDays()));
    }

    /** True for a request whose window ran out, whether or not the sweep has stored the expiry yet. */
    boolean lapsed(String status, Instant createdAt, Instant now) {
        return ContactRequestStatuses.EXPIRED.equals(status)
                || (ContactRequestStatuses.PENDING.equals(status) && createdAt != null
                        && createdAt.isBefore(cutoff(now)));
    }
}

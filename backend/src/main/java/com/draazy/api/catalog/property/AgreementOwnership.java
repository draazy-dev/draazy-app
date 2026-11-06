package com.draazy.api.catalog.property;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.VerificationAnnouncer;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

// A rent agreement's final copy is only uploaded after staff verify the licensor's ID and title
// papers, so it stands in for the ownership evidence an admin would otherwise review.
@Component
public class AgreementOwnership {
    private final AuditService audit;
    private final VerificationAnnouncer announcer;
    private final ApplicationEventPublisher events;
    private final Notifier notifier;

    AgreementOwnership(AuditService audit, VerificationAnnouncer announcer, ApplicationEventPublisher events,
            Notifier notifier) {
        this.audit = audit;
        this.announcer = announcer;
        this.events = events;
        this.notifier = notifier;
    }

    public boolean verify(Property listing, UUID agreementRequestId) {
        Instant now = Instant.now();
        UUID ownerId = listing.getOwner().getId();
        if (!listing.getOwner().isVerified() || listing.isOwnershipVerifiedAt(now)) {
            return false;
        }
        listing.verifyOwnership(now, null);
        audit.record("system", "admin", "property.ownership.verified", "property", listing.getId().toString(),
                Map.of("via", "rent_agreement", "request", agreementRequestId.toString(),
                        "owner", ownerId.toString()));
        announcer.announceOwnershipVerified(ownerId, listing.getId(), now);
        events.publishEvent(new OwnershipVerified(listing.getId()));
        notifier.notify(ownerId, "listing.badge_verified", "Your listing is a Verified property",
                PropertyLifecycle.label(listing) + " now carries the Verified property badge.", "/dashboard");
        return true;
    }
}

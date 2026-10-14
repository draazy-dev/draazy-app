package com.draazy.api.deals.visit;

import com.draazy.api.catalog.property.PropertyArchived;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import java.time.Instant;
import java.util.Map;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

// Same transaction as the archive, so a listing is never withdrawn with visits still booked on it. Past visits are
// left for the owner to mark completed.
@Component
class ArchivedListingVisits {

    private final VisitRepository visits;
    private final PropertyRepository properties;
    private final Notifier notifier;
    private final AuditService audit;

    ArchivedListingVisits(VisitRepository visits, PropertyRepository properties, Notifier notifier,
                          AuditService audit) {
        this.visits = visits;
        this.properties = properties;
        this.notifier = notifier;
        this.audit = audit;
    }

    @EventListener
    void onArchived(PropertyArchived event) {
        // Same row lock VisitService.schedule takes, so a booking in flight is committed before the select below.
        properties.findForVerificationDecision(event.propertyId());
        for (Visit visit : visits.findUpcomingByProperty(event.propertyId(), Instant.now())) {
            String before = visit.getStatus();
            visit.setStatus(VisitStatuses.CANCELLED);
            audit.record("system", "admin", "visit.status", "visit", visit.getId().toString(),
                    Map.of("fromStatus", before, "toStatus", VisitStatuses.CANCELLED, "reason", "listing archived"));
            notifier.notify(visit.getVisitorId(), "visit.cancelled",
                    "A visit was cancelled",
                    "The listing you booked was taken down, so your visit is cancelled.",
                    "/dashboard#visits");
        }
    }
}

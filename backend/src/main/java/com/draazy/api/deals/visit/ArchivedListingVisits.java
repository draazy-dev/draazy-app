package com.draazy.api.deals.visit;

import com.draazy.api.catalog.property.PropertyArchived;
import com.draazy.api.catalog.property.PropertyClosed;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

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
        cancelUpcoming(event.propertyId(), "listing archived",
                "The listing you booked was taken down, so your visit is cancelled.");
    }

    @EventListener
    void onClosed(PropertyClosed event) {
        cancelUpcoming(event.propertyId(), "listing closed",
                "The listing you booked is no longer available, so your visit is cancelled.");
    }

    private void cancelUpcoming(UUID propertyId, String reason, String message) {
        properties.findForVerificationDecision(propertyId);
        for (Visit visit : visits.findUpcomingByProperty(propertyId, Instant.now())) {
            String before = visit.getStatus();
            visit.setStatus(VisitStatuses.CANCELLED);
            audit.record("system", "admin", "visit.status", "visit", visit.getId().toString(),
                    Map.of("fromStatus", before, "toStatus", VisitStatuses.CANCELLED, "reason", reason));
            notifier.notify(visit.getVisitorId(), "visit.cancelled",
                    "A visit was cancelled",
                    message,
                    "/dashboard#visits");
        }
    }
}

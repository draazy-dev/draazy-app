package com.draazy.api.deals.visit;

import com.draazy.api.common.trust.VisitUsageLookup;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class VisitUsageService implements VisitUsageLookup {

    private final VisitRepository visits;

    VisitUsageService(VisitRepository visits) {
        this.visits = visits;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Booking> countedBookings(UUID visitorId) {
        return visits.findCountedForQuota(visitorId).stream()
                .map(v -> new Booking(v.getPropertyId(), v.getCreatedAt(),
                        VisitStatuses.SCHEDULED.equals(v.getStatus())))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean ownerConfirmed(UUID visitorId, UUID propertyId) {
        return visits.existsByVisitorIdAndPropertyIdAndConfirmedAtIsNotNull(visitorId, propertyId);
    }
}

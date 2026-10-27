package com.draazy.api.deals.visit;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.LeadIntroductions;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class VisitIntroductions implements LeadIntroductions {

    private final VisitRepository visits;
    private final PropertyRepository properties;

    VisitIntroductions(VisitRepository visits, PropertyRepository properties) {
        this.visits = visits;
        this.properties = properties;
    }

    @Override
    public String kind() {
        return "visit";
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Pair> chattable(UUID visitId, UUID userId) {
        return visits.findById(visitId)
                .filter(visit -> visit.getConfirmedAt() != null)
                .flatMap(visit -> properties.findById(visit.getPropertyId())
                        .flatMap(listing -> LeadIntroductions.between(userId, visit.getVisitorId(),
                                listing.getOwner().getId(), visit.getPropertyId())));
    }

    @Override
    @Transactional(readOnly = true)
    public boolean introduces(UUID visitorId, UUID propertyId) {
        return visits.existsByVisitorIdAndPropertyIdAndConfirmedAtIsNotNull(visitorId, propertyId);
    }
}

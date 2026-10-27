package com.draazy.api.deals.offer;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.LeadIntroductions;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class OfferIntroductions implements LeadIntroductions {

    private final OfferRepository offers;
    private final PropertyRepository properties;

    OfferIntroductions(OfferRepository offers, PropertyRepository properties) {
        this.offers = offers;
        this.properties = properties;
    }

    @Override
    public String kind() {
        return "offer";
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Pair> chattable(UUID offerId, UUID userId) {
        return offers.findById(offerId)
                .filter(offer -> OfferStatuses.ACCEPTED.equals(offer.getStatus()))
                .flatMap(offer -> properties.findById(offer.getPropertyId())
                        .flatMap(listing -> LeadIntroductions.between(userId, offer.getFromUserId(),
                                listing.getOwner().getId(), offer.getPropertyId())));
    }

    @Override
    @Transactional(readOnly = true)
    public boolean introduces(UUID buyerId, UUID propertyId) {
        return offers.existsByFromUserIdAndPropertyIdAndStatus(buyerId, propertyId, OfferStatuses.ACCEPTED);
    }
}

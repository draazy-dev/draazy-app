package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.ListingSlotLookup;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
class ListingSlotCounter implements ListingSlotLookup {
    private final PropertyRepository properties;

    ListingSlotCounter(PropertyRepository properties) {
        this.properties = properties;
    }

    @Override
    public long listingSlotsHeld(UUID userId) {
        return properties.countLiveUncovered(userId, Instant.now());
    }
}

package com.draazy.api.common.trust;

import java.util.UUID;

public interface ListingSlotLookup {
    long listingSlotsHeld(UUID userId);
}

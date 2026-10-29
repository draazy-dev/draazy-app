package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface VisitUsageLookup {
    record Booking(UUID propertyId, Instant bookedAt, boolean awaitingReply) {
    }

    List<Booking> countedBookings(UUID visitorId);
}

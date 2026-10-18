package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Visit facts {@code leads} needs, as a port so it can read them without importing {@code deals}. */
public interface VisitUsageLookup {

    record Booking(UUID propertyId, Instant bookedAt, boolean awaitingReply) {
    }

    /** Every visit except one cancelled before the owner confirmed it; a scheduled one awaits the owner's reply. */
    List<Booking> countedBookings(UUID visitorId);

    /** Sticky once the owner has confirmed any slot: a later reschedule or cancel does not un-introduce the pair. */
    boolean ownerConfirmed(UUID visitorId, UUID propertyId);
}

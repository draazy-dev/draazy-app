package com.draazy.api.admin;

import java.util.List;

/** Nullable figures are null, not 0h or 100%, when nothing was decided; no NON_NULL so the blank reaches the screen.
 *  Backlog counts ignore the window: narrowing a present-tense backlog would drop its oldest rows. */
public record SlaSummary(
        int targetHours,
        long reviewedCount,
        Double avgHoursToReview,
        Double medianHoursToReview,
        long breachedCount,
        Integer slaRatePct,
        long pendingCount,
        long pendingBreachingCount,
        List<PendingListing> worstPending,
        Track ticketPickup,
        Track ticketDelivery,
        Track conciergeToLive,
        Track flatmateReview) {

    /** The listing-review fields above stay flat because they were on the wire before tracks existed. */
    public record Track(
            int targetHours,
            long completedCount,
            Double avgHours,
            Double medianHours,
            long breachedCount,
            Integer slaRatePct,
            long outstandingCount,
            long outstandingBreachingCount) {
    }

    /** No owner or locality: a work queue, not a second unpaginated export of the property table. */
    public record PendingListing(String id, String title, double hoursWaiting) {
    }
}
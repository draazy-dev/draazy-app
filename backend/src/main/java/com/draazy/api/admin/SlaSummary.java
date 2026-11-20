package com.draazy.api.admin;

import java.util.List;

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

    public record PendingListing(String id, String title, double hoursWaiting) {
    }
}
package com.draazy.api.admin;

import com.draazy.api.moderation.property.PendingQueue;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/** A section is present only when the caller holds its atom, so absent means "not yours", never "zero". */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AdminDashboard(
        AdminKpis kpis,
        Traffic traffic,
        SlaGlance sla,
        Listings listings,
        Demand demand,
        Tickets tickets,
        Long owners,
        Flatmates flatmates) {

    /** Today's and the last thirty days' sessions, and today's signups. */
    public record Traffic(long signupsToday, long sessionsToday, long sessions30d) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SlaGlance(Track listingApproval, Track ticketPickup, Track ticketDelivery,
            Track conciergeToLive, Track flatmateReview) {
    }

    /** {@code slaRatePct} is null, not 100, when nothing has been measured. */
    public record Track(Integer slaRatePct, int targetHours, long late) {
    }

    /** {@code followUp}: live listings whose owner has not confirmed availability past the freshness cutoff. */
    public record Listings(long pending, long flagged, long followUp,
            List<PendingQueue.Row> oldestPending) {
    }

    /** Whole-table counts: pending enquiries, scheduled visits, deals not yet closed. */
    public record Demand(long newEnquiries, long scheduledVisits, long dealsInProgress) {
    }

    public record Tickets(long open, String openTeam, List<TicketRow> latest) {
    }

    public record TicketRow(String id, String team, String service, String customer, String mobile,
            String detail, String status) {
    }

    /** Reply figures cover requests sent in the last 30 days and are null when none could be judged. */
    public record Flatmates(long awaitingReview, long openReports, long unansweredRequests, long liveRooms,
            long liveGroups, long activeSeekers, long newSeekers7d, long matches30d, Integer replyRatePct,
            Double medianReplyHours) {
    }
}
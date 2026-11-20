package com.draazy.api.admin;

import com.draazy.api.moderation.property.PendingQueue;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

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
    public record Traffic(long signupsToday, long sessionsToday, long sessions30d) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SlaGlance(Track listingApproval, Track ticketPickup, Track ticketDelivery,
            Track conciergeToLive, Track flatmateReview) {
    }

    public record Track(Integer slaRatePct, int targetHours, long late) {
    }

    public record Listings(long pending, long flagged, long followUp,
            List<PendingQueue.Row> oldestPending) {
    }

    public record Demand(long newEnquiries, long scheduledVisits, long dealsInProgress) {
    }

    public record Tickets(long open, String openTeam, List<TicketRow> latest) {
    }

    public record TicketRow(String id, String team, String service, String customer, String mobile,
            String detail, String status) {
    }

    public record Flatmates(long awaitingReview, long openReports, long unansweredRequests, long liveRooms,
            long liveGroups, long activeSeekers, long newSeekers7d, long matches30d, Integer replyRatePct,
            Double medianReplyHours) {
    }
}
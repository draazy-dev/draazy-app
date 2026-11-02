package com.draazy.api.admin.leads;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class LeadViews {
    private LeadViews() {
    }

    public record LeadSummary(UUID id, String name, String maskedMobile, String stage, List<String> interests,
            List<String> sources, UUID ownerId, String ownerName, boolean mine, Instant nextFollowUpAt,
            Instant lastContactAt, Instant lastSignalAt, int failedAttempts, String consent, boolean due,
            LeadProfile profile) {
    }

    public record LeadDetail(UUID id, String name, String maskedMobile, String mobile, String stage,
            List<String> interests,
            List<String> sources, UUID ownerId, String ownerName, boolean mine, Instant nextFollowUpAt,
            Instant lastContactAt, Instant lastSignalAt, int failedAttempts, String consent, boolean due,
            LeadProfile profile, UUID userId, Instant nextContactAfter, List<Signal> signals,
            List<Activity> activities, List<Conversion> conversions) {
    }

    public record Signal(String source, String service, String summary, Instant createdAt) {
    }

    public record Activity(UUID id, String kind, String outcome, String body, String actorName, Instant createdAt) {
    }

    public record Conversion(UUID id, UUID serviceRequestId, String service, BigDecimal amount, UUID creditedToId,
            String creditedToName, Instant createdAt) {
    }

    public record Convertible(UUID id, String type, BigDecimal amount, String status, Instant createdAt) {
    }

    public record Assignee(UUID id, String name, int openLeads) {
    }

    public record PerformanceRow(UUID staffId, String staffName, int openLeads, int claimed, int contacted,
            int attempts, double avgFirstContactHours, int conversions, long revenue, double conversionRate) {
    }

    public record Performance(int days, List<PerformanceRow> rows, PerformanceRow totals) {
    }
}

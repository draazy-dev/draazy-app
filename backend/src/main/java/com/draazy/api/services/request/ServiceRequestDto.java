package com.draazy.api.services.request;

import com.draazy.api.documents.vault.DocumentSummary;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public record ServiceRequestDto(
        String id,
        String type,
        String team,
        ServiceRequestStatus status,
        String propertyId,
        String ticketId,
        Map<String, Object> details,
        String assignee,
        boolean assignedToMe,
        List<TimelineEntry> timeline,
        List<DocumentSummary> documents,
        List<MessageDto> messages,
        List<ServiceRequestPartyDto> parties,
        Instant createdAt,
        Long amount,
        String paymentSessionId,
        RegistrationDto registration,
        PoliceIntimationDto policeIntimation,
        Sla sla,
        Amendment amendment,
        DraftApproval draftApproval,
        Charges charges,
        Attention attention,
        boolean cancellable,
        boolean editableByMe,
        boolean mySideSubmitted,
        @JsonInclude(JsonInclude.Include.NON_NULL) String myPartyId,
        boolean payableByMe,
        @JsonInclude(JsonInclude.Include.NON_NULL) String paidBy) {
    public record Charges(long platformFee, long stampDuty, long exactDutyInPaise, long registration, long handling,
            boolean referralCredit) {
    }

    public record Attention(String party, String reason, List<Paper> papers, Instant askedAt, boolean forYou) {
    }

    public record Paper(String id, String name) {
    }

    public record TimelineEntry(Instant at, String event, String by) {
    }

    public record Sla(String waitingOn, Instant dueAt, boolean overdue) {
    }

    public record Amendment(String id, Map<String, Object> terms, String reason, long amountBefore,
            long amountAfter, long delta, boolean checkoutOpen, Instant proposedAt) {
    }

    public record DraftApproval(int version, int approved, int total,
            List<DraftApprovalParty> parties) {
    }

    public record DraftApprovalParty(String key, String label, String method, String mobile,
            boolean opened, boolean approved, Instant approvedAt, boolean mine) {
    }

    public ServiceRequestDto withPaymentSessionId(String sessionId) {
        return new ServiceRequestDto(id, type, team, status, propertyId, ticketId, details, assignee,
                assignedToMe, timeline, documents, messages, parties, createdAt, amount, sessionId, registration,
                policeIntimation, sla, amendment, draftApproval, charges, attention, cancellable, editableByMe,
                mySideSubmitted, myPartyId, payableByMe, paidBy);
    }
}

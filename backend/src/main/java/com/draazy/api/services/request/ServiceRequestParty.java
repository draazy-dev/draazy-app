package com.draazy.api.services.request;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "service_request_parties")
@Getter
public class ServiceRequestParty extends AuditedEntity {
    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "mobile")
    private String mobile;

    @Column(name = "invite_expires_at")
    private Instant inviteExpiresAt;

    @Column(name = "role", nullable = false, updatable = false)
    private String role;

    @Column(name = "party_index", nullable = false, updatable = false)
    private int partyIndex;

    @Column(name = "status", nullable = false)
    private String status = CoFillParties.INVITED;

    @Column(name = "invited_by", nullable = false, updatable = false)
    private UUID invitedBy;

    @Column(name = "details_submitted_at")
    private Instant detailsSubmittedAt;

    protected ServiceRequestParty() {
    }

    ServiceRequestParty(UUID requestId, UUID userId, String role, int partyIndex, UUID invitedBy) {
        this.requestId = requestId;
        this.userId = userId;
        this.role = role;
        this.partyIndex = partyIndex;
        this.invitedBy = invitedBy;
    }

    ServiceRequestParty(UUID requestId, String mobile, Instant expiresAt, String role, int partyIndex,
            UUID invitedBy) {
        this.requestId = requestId;
        this.mobile = mobile;
        this.inviteExpiresAt = expiresAt;
        this.role = role;
        this.partyIndex = partyIndex;
        this.invitedBy = invitedBy;
    }

    boolean isPending() {
        return userId == null;
    }

    void claim(UUID claimant) {
        this.userId = claimant;
        this.mobile = null;
        this.inviteExpiresAt = null;
    }

    void answer(String outcome) {
        this.status = outcome;
    }

    void markDetailsSubmitted(Instant at) {
        this.detailsSubmittedAt = at;
    }
}

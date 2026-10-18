package com.draazy.api.engagement.flatmate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "flatmate_interest_withdrawals")
@Getter
public class FlatmateInterestWithdrawal {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    @Column(name = "kind", nullable = false, updatable = false)
    private String kind;

    @Column(name = "target_id", nullable = false, updatable = false)
    private UUID targetId;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt;

    @Column(name = "withdrawn_at", nullable = false, updatable = false)
    private Instant withdrawnAt;

    protected FlatmateInterestWithdrawal() {
        // JPA
    }

    FlatmateInterestWithdrawal(FlatmateRequest request, Instant withdrawnAt) {
        this.requesterId = request.getRequesterId();
        this.kind = request.getKind();
        this.targetId = request.getTargetId();
        this.requestedAt = request.getCreatedAt();
        this.withdrawnAt = withdrawnAt;
    }
}

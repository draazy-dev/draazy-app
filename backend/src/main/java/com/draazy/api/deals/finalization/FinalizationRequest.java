package com.draazy.api.deals.finalization;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "finalization_requests")
@Getter
public class FinalizationRequest extends AuditedEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "initiator_id", nullable = false, updatable = false)
    private UUID initiatorId;

    @Column(name = "counterparty_id", nullable = false, updatable = false)
    private UUID counterpartyId;

    @Column(name = "agreed_price", nullable = false)
    private long agreedPrice;

    @Column(name = "status", nullable = false)
    @Setter
    private String status = FinalizationStatuses.PENDING;

    protected FinalizationRequest() {
    }

    public FinalizationRequest(UUID propertyId, UUID initiatorId, UUID counterpartyId,
                               long agreedPrice) {
        this.propertyId = propertyId;
        this.initiatorId = initiatorId;
        this.counterpartyId = counterpartyId;
        this.agreedPrice = agreedPrice;
    }
}

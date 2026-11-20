package com.draazy.api.deals.offer;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "offers")
@Getter
public class Offer extends AuditedEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "from_user_id", nullable = false, updatable = false)
    private UUID fromUserId;

    @Column(name = "amount", nullable = false)
    @Setter
    private long amount;

    @Column(name = "status", nullable = false)
    @Setter
    private String status = OfferStatuses.PENDING;

    @Column(name = "message")
    @Setter
    private String message;

    @Column(name = "move_in")
    @Setter
    private LocalDate moveIn;

    protected Offer() {
    }

    public Offer(UUID propertyId, UUID fromUserId, long amount, String message, LocalDate moveIn) {
        this.propertyId = propertyId;
        this.fromUserId = fromUserId;
        this.amount = amount;
        this.message = message;
        this.moveIn = moveIn;
    }
}

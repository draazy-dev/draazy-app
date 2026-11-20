package com.draazy.api.deals.visit;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "visits")
@Getter
public class Visit extends VersionedEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "visitor_id", nullable = false, updatable = false)
    private UUID visitorId;

    @Column(name = "slot", nullable = false)
    private Instant slot;

    @Column(name = "mode", nullable = false)
    private String mode = VisitModes.IN_PERSON;

    @Column(name = "status", nullable = false)
    private String status = VisitStatuses.SCHEDULED;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "note")
    private String note;

    @Column(name = "cancelled_by_visitor", nullable = false)
    private boolean cancelledByVisitor;

    protected Visit() {
    }

    public Visit(UUID propertyId, UUID visitorId, Instant slot, String mode, String note) {
        this.propertyId = propertyId;
        this.visitorId = visitorId;
        this.slot = slot;
        this.mode = mode != null ? mode : VisitModes.IN_PERSON;
        this.note = note;
    }

    public void setStatus(String status) {
        if (VisitStatuses.CONFIRMED.equals(status) && confirmedAt == null) {
            confirmedAt = Instant.now();
        }
        this.status = status;
    }

    public void cancelByVisitor() {
        this.status = VisitStatuses.CANCELLED;
        this.cancelledByVisitor = true;
    }

    public void reschedule(Instant newSlot) {
        this.slot = newSlot;
        this.status = VisitStatuses.SCHEDULED;
    }
}

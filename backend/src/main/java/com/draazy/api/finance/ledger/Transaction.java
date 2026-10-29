package com.draazy.api.finance.ledger;

import com.draazy.api.common.persistence.SoftDeleteEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "transactions")
@Getter
public class Transaction extends SoftDeleteEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "type", nullable = false)
    @Setter
    private String type;

    @Column(name = "category")
    @Setter
    private String category;

    @Column(name = "amount", nullable = false)
    @Setter
    private Long amount;

    @Column(name = "date", nullable = false)
    @Setter
    private LocalDate date;

    @Column(name = "note")
    @Setter
    private String note;

    @Column(name = "recurring", nullable = false)
    @Setter
    private String recurring = RecurringIntervals.NONE;

    protected Transaction() {
    }

    public Transaction(UUID propertyId, UUID ownerId, String type, Long amount, LocalDate date) {
        this.propertyId = propertyId;
        this.ownerId = ownerId;
        this.type = type;
        this.amount = amount;
        this.date = date;
    }
}

package com.draazy.api.deals.offer;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "offer_history")
@Getter
public class OfferHistory {
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "offer_id", nullable = false, updatable = false)
    private UUID offerId;

    @Column(name = "amount", nullable = false, updatable = false)
    private long amount;

    @Column(name = "\"by\"", nullable = false, updatable = false)
    private String by;

    @CreationTimestamp
    @Column(name = "\"at\"", nullable = false, updatable = false)
    private Instant at;

    protected OfferHistory() {
    }

    public OfferHistory(UUID offerId, long amount, String by) {
        this.offerId = offerId;
        this.amount = amount;
        this.by = by;
    }
}

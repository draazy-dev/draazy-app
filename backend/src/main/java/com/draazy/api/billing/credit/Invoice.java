package com.draazy.api.billing.credit;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

/** The GST tax invoice for one successful payment; immutable once issued. */
@Entity
@Table(name = "invoices")
@Getter
public class Invoice extends BaseEntity {

    @Column(name = "number", nullable = false, updatable = false)
    private String number;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "source_type", nullable = false, updatable = false)
    private String sourceType;

    @Column(name = "source_id", nullable = false, updatable = false)
    private UUID sourceId;

    @Column(name = "order_ref", updatable = false)
    private String orderRef;

    @Column(name = "amount", nullable = false, updatable = false)
    private long amount;

    @Column(name = "taxable_amount", nullable = false, updatable = false)
    private long taxableAmount;

    @Column(name = "gst_amount", nullable = false, updatable = false)
    private long gstAmount;

    @Column(name = "gst_percent", nullable = false, updatable = false)
    private BigDecimal gstPercent;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private Instant issuedAt;

    protected Invoice() {
        // JPA
    }

    Invoice(String number, UUID userId, String sourceType, UUID sourceId, String orderRef, long amount,
            GstSplit split, Instant issuedAt) {
        this.number = number;
        this.userId = userId;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.orderRef = orderRef;
        this.amount = amount;
        this.taxableAmount = split.taxable();
        this.gstAmount = split.gst();
        this.gstPercent = split.percent();
        this.issuedAt = issuedAt;
    }

    /** The part of the amount that carries GST, tax included. */
    public long taxableInclusive() {
        return taxableAmount + gstAmount;
    }
}

package com.draazy.api.billing.credit;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

/** A GST credit note for one confirmed refund; immutable once issued. */
@Entity
@Table(name = "credit_notes")
@Getter
public class CreditNote extends BaseEntity {

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

    @Column(name = "invoice_no", updatable = false)
    private String invoiceNo;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private Instant issuedAt;

    protected CreditNote() {
        // JPA
    }

    CreditNote(String number, UUID userId, String sourceType, UUID sourceId, String orderRef, long amount,
            GstSplit split, String invoiceNo, Instant issuedAt) {
        this.number = number;
        this.userId = userId;
        this.sourceType = sourceType;
        this.sourceId = sourceId;
        this.orderRef = orderRef;
        this.amount = amount;
        this.taxableAmount = split.taxable();
        this.gstAmount = split.gst();
        this.gstPercent = split.percent();
        this.invoiceNo = invoiceNo;
        this.issuedAt = issuedAt;
    }
}
package com.draazy.api.services.request;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "service_requests")
@Getter
public class ServiceRequest extends VersionedEntity {
    @Column(name = "requester_id", updatable = false)
    private UUID requesterId;

    @Column(name = "type", nullable = false, updatable = false)
    private String type;

    @Column(name = "team", nullable = false, updatable = false)
    private String team;

    @Column(name = "ticket_id", updatable = false)
    private UUID ticketId;

    @Column(name = "status", nullable = false)
    @Convert(converter = ServiceRequestStatus.Converter.class)
    private ServiceRequestStatus status = ServiceRequestStatus.NEW;

    @Column(name = "property_id", updatable = false)
    private UUID propertyId;

    @Column(name = "assignee_id")
    @Setter
    private UUID assigneeId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details")
    private Map<String, Object> details;

    @Column(name = "amount")
    private Long amount;

    @Column(name = "status_changed_at", nullable = false)
    private Instant statusChangedAt = Instant.now();

    @Column(name = "payment_ref")
    private String paymentRef;

    @Column(name = "referral_credit", nullable = false)
    private boolean referralCredit;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "attention")
    private Map<String, Object> attention;

    protected ServiceRequest() {
    }

    public ServiceRequest(UUID requesterId, String type, UUID propertyId,
            Map<String, Object> details, UUID ticketId) {
        this.requesterId = requesterId;
        this.type = type;
        this.team = ServiceRequestTypes.teamFor(type);
        this.propertyId = propertyId;
        this.details = details;
        this.ticketId = ticketId;
    }

    void replaceDetails(Map<String, Object> details) {
        this.details = details;
    }

    void askAttention(Map<String, Object> attention) {
        this.attention = attention;
    }

    void charge(long extra) {
        this.amount = (amount == null ? 0L : amount) + extra;
    }

    void awaitPayment(long amount) {
        this.status = ServiceRequestStatus.AWAITING_PAYMENT;
        this.amount = amount;
    }

    void spendReferralCredit(long amountAfterWaiver) {
        this.referralCredit = true;
        this.amount = amountAfterWaiver;
    }

    boolean attachOrder(String orderId) {
        if (status != ServiceRequestStatus.AWAITING_PAYMENT || paymentRef != null) {
            return false;
        }
        this.paymentRef = orderId;
        return true;
    }

    void moveTo(ServiceRequestStatus status) {
        this.status = status;
        this.statusChangedAt = Instant.now();
        if (status != ServiceRequestStatus.ACTION_REQUIRED) {
            this.attention = null;
        }
    }
}

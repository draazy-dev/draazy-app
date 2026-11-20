package com.draazy.api.services.ticket;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "tickets")
@Getter
public class Ticket extends VersionedEntity {
    @Column(name = "subject", nullable = false)
    private String subject;

    @Column(name = "team")
    @Setter
    private String team;

    @Column(name = "priority", nullable = false)
    @Setter
    private String priority = TicketPriorities.MEDIUM;

    @Column(name = "status", nullable = false)
    @Setter
    private String status = TicketStatuses.OPEN;

    @Column(name = "property_id")
    private UUID propertyId;

    @Column(name = "requester_id", updatable = false)
    private UUID requesterId;

    @Column(name = "assignee_id")
    @Setter
    private UUID assigneeId;

    @Column(name = "service")
    private String service;

    @Column(name = "customer")
    private String customer;

    @Column(name = "mobile")
    private String mobile;

    @Column(name = "value")
    private Long value;

    @Column(name = "quoted_value", updatable = false)
    private Long quotedValue;

    @Column(name = "detail")
    private String detail;

    protected Ticket() {
    }

    public Ticket(String subject, String team, String priority, UUID propertyId, UUID requesterId,
            String customer, String mobile, String detail, Long quotedValue) {
        this.subject = subject;
        this.team = team;
        if (priority != null) {
            this.priority = priority;
        }
        this.propertyId = propertyId;
        this.requesterId = requesterId;
        this.customer = customer;
        this.mobile = mobile;
        this.detail = detail;
        this.quotedValue = quotedValue;
    }
}

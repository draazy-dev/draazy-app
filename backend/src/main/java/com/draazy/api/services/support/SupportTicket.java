package com.draazy.api.services.support;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "support_tickets")
@Getter
public class SupportTicket extends VersionedEntity {
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "subject", nullable = false, updatable = false)
    private String subject;

    @Column(name = "category", updatable = false)
    private String category;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "unread", nullable = false)
    private boolean unread;

    @Column(name = "staff_unread", nullable = false)
    private boolean staffUnread;

    protected SupportTicket() {
    }

    SupportTicket(UUID userId, String subject, String category) {
        this.userId = userId;
        this.subject = subject;
        this.category = category;
        this.status = SupportTicketStatuses.OPEN;
    }

    void setUnread(boolean unread) {
        this.unread = unread;
    }

    void close() {
        this.status = SupportTicketStatuses.CLOSED;
        this.staffUnread = false;
    }

    void setStaffUnread(boolean staffUnread) {
        this.staffUnread = staffUnread;
    }
}

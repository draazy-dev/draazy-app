package com.draazy.api.services.support;

import com.draazy.api.common.persistence.VersionedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;

/** A customer's support thread; {@code unread} is the raiser's flag, {@code staffUnread} the desk's. */
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

    /** The desk's side: a customer message no staff member has read. Column added in V53. */
    @Column(name = "staff_unread", nullable = false)
    private boolean staffUnread;

    protected SupportTicket() {
        // JPA
    }

    SupportTicket(UUID userId, String subject, String category) {
        this.userId = userId;
        this.subject = subject;
        this.category = category;
        this.status = SupportTicketStatuses.OPEN;
    }

    /** Package-private: only a reply or a read marks the ticket, never a caller directly. */
    void setUnread(boolean unread) {
        this.unread = unread;
    }

    /** Package-private: a ticket is closed by the flow that owns it, never by a caller directly. */
    void close() {
        this.status = SupportTicketStatuses.CLOSED;
        this.staffUnread = false;
    }

    /** Package-private, for the same reason as {@link #setUnread(boolean)}. */
    void setStaffUnread(boolean staffUnread) {
        this.staffUnread = staffUnread;
    }
}

package com.draazy.api.services.support;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "support_ticket_messages")
@Getter
public class SupportTicketMessage extends BaseEntity {
    @Column(name = "ticket_id", nullable = false, updatable = false)
    private UUID ticketId;

    @Column(name = "author_id", updatable = false)
    private UUID authorId;

    @Column(name = "author_role", updatable = false)
    private String authorRole;

    @Column(name = "body", nullable = false, updatable = false)
    private String body;

    @Column(name = "about_type", updatable = false)
    private String aboutType;

    @Column(name = "about_id", updatable = false)
    private String aboutId;

    protected SupportTicketMessage() {
    }

    SupportTicketMessage(UUID ticketId, UUID authorId, String authorRole, String body,
            SupportTicketAbout about) {
        this.ticketId = ticketId;
        this.authorId = authorId;
        this.authorRole = authorRole;
        this.body = body;
        if (about != null) {
            this.aboutType = about.type();
            this.aboutId = about.id();
        }
    }
}

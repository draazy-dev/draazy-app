package com.draazy.api.services.ticket;

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
@Table(name = "ticket_notes")
@Getter
public class TicketNote {
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "ticket_id", nullable = false, updatable = false)
    private UUID ticketId;

    @Column(name = "by", updatable = false)
    private String by;

    @Column(name = "text", nullable = false, updatable = false)
    private String text;

    @CreationTimestamp
    @Column(name = "at", nullable = false, updatable = false)
    private Instant at;

    protected TicketNote() {
    }

    TicketNote(UUID ticketId, String by, String text) {
        this.ticketId = ticketId;
        this.by = by;
        this.text = text;
    }
}

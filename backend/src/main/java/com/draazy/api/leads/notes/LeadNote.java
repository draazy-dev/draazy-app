package com.draazy.api.leads.notes;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

// The documents leadKey embeds a buyer mobile number: treat as PII, never log, index or share.
@Entity
@Table(name = "lead_notes")
@Getter
public class LeadNote extends AuditedEntity {
    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "lead_key", nullable = false, updatable = false)
    private String leadKey;

    @Column(name = "note")
    private String note;

    @Column(name = "follow_up_at")
    private Instant followUpAt;

    protected LeadNote() {
    }

    public LeadNote(UUID ownerId, String leadKey) {
        this.ownerId = ownerId;
        this.leadKey = leadKey;
    }

    public void replace(String note, Instant followUpAt) {
        this.note = note;
        this.followUpAt = followUpAt;
    }
}

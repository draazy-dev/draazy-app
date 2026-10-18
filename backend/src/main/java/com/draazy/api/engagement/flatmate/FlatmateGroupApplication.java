package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

// status is the owner's decision and modStatus the admin's; an admin removing spam must not decline on the
// owner's behalf, so moderate() and decide() touch different fields.
@Entity
@Table(name = "flatmate_group_applications")
@Getter
public class FlatmateGroupApplication extends AuditedEntity {

    @Column(name = "listing_id", nullable = false, updatable = false)
    private UUID listingId;

    @Column(name = "group_id", nullable = false, updatable = false)
    private UUID groupId;

    /** The group's host, denormalised so the admin list need not resolve it per row. */
    @Column(name = "applicant_id", nullable = false)
    private UUID applicantId;

    @Column(name = "status", nullable = false)
    private String status = FlatmateVocabulary.STATUS_PENDING;

    @Column(name = "mod_status", nullable = false)
    private String modStatus = FlatmateVocabulary.MOD_LIVE;

    /** Internal moderation note. The contract has no field for it; it is never returned. */
    @Column(name = "note")
    private String note;

    @Column(name = "decided_at")
    private Instant decidedAt;

    protected FlatmateGroupApplication() {
    }

    FlatmateGroupApplication(UUID listingId, UUID groupId, UUID applicantId) {
        this.listingId = listingId;
        this.groupId = groupId;
        this.applicantId = applicantId;
    }

    /** The owner's axis. The check constraint guarantees a timestamp travels with the decision. */
    void decide(String decision) {
        this.status = decision;
        this.decidedAt = Instant.now();
    }

    void reopen(UUID reapplicantId) {
        this.status = FlatmateVocabulary.STATUS_PENDING;
        this.decidedAt = null;
        this.applicantId = reapplicantId;
    }

    /** The admin's axis. Deliberately cannot touch {@link #status}. */
    void moderate(String newModStatus, String internalNote) {
        this.modStatus = newModStatus;
        this.note = internalNote;
    }
}

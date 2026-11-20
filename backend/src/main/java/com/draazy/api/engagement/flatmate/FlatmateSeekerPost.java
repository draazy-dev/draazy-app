package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "flatmate_seeker_posts")
@Getter
public class FlatmateSeekerPost extends AuditedEntity implements FlatmateModerated {
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "name", nullable = false)
    @Setter
    private String name;

    @Column(name = "gender", nullable = false)
    @Setter
    private String gender = "any";

    @Column(name = "age")
    @Setter
    private Integer age;

    @Column(name = "title")
    @Setter
    private String title;

    @Column(name = "occupation")
    @Setter
    private String occupation;

    @Column(name = "budget", nullable = false)
    @Setter
    private Long budget;

    @Column(name = "budget_max")
    @Setter
    private Long budgetMax;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "localities", nullable = false)
    @Setter
    private List<String> localities = new ArrayList<>();

    @Column(name = "move_in")
    @Setter
    private String moveIn;

    @Column(name = "move_in_at")
    @Setter
    private LocalDate moveInAt;

    @Column(name = "flat_pref", nullable = false)
    @Setter
    private String flatPref = "any";

    @Column(name = "room_pref", nullable = false)
    @Setter
    private String roomPref = "any";

    @Column(name = "furnishing")
    @Setter
    private String furnishing;

    @Column(name = "gated_only", nullable = false)
    @Setter
    private boolean gatedOnly = false;

    @Column(name = "attached_bath", nullable = false)
    @Setter
    private boolean attachedBath = false;

    @Column(name = "parking")
    @Setter
    private String parking;

    @Column(name = "note")
    @Setter
    private String note;

    @Column(name = "verified_contact_only", nullable = false)
    @Setter
    private boolean verifiedContactOnly = false;

    @Column(name = "verified", nullable = false)
    @Setter
    private boolean verified = false;

    @Column(name = "mod_status", nullable = false)
    @Setter
    private String modStatus = FlatmateVocabulary.MOD_PENDING;

    @Embedded
    private ModerationRecheck recheck = new ModerationRecheck();

    @Embedded
    private FlatmateExpiry expiry = new FlatmateExpiry();

    @Column(name = "lat")
    @Setter
    private Double lat;

    @Column(name = "lng")
    @Setter
    private Double lng;

    @Column(name = "archived", nullable = false)
    private boolean archived = false;

    @Column(name = "archived_at")
    private Instant archivedAt;

    @Column(name = "archive_reason")
    private String archiveReason;

    protected FlatmateSeekerPost() {
    }

    FlatmateSeekerPost(UUID userId, String name, Long budget) {
        this.userId = userId;
        this.name = name;
        this.budget = budget;
    }

    void archive(String reason) {
        this.archived = true;
        this.archivedAt = Instant.now();
        this.archiveReason = reason;
    }

    public boolean isVisible() {
        return !archived && FlatmateVocabulary.isPublic(modStatus);
    }

    public ModerationRecheck getRecheck() {
        if (recheck == null) {
            recheck = new ModerationRecheck();
        }
        return recheck;
    }
}

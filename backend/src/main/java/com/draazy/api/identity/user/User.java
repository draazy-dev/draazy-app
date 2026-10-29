package com.draazy.api.identity.user;

import com.draazy.api.common.persistence.SoftDeleteEntity;
import com.draazy.api.security.Roles;
import com.draazy.api.security.TokenSubject;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.DynamicUpdate;

@Entity
@Table(name = "users")
@DynamicUpdate
@Getter
public class User extends SoftDeleteEntity implements TokenSubject {
    @Column(name = "name")
    @Setter
    private String name;

    @Column(name = "mobile", nullable = false, unique = true)
    private String mobile;

    @Column(name = "email")
    @Setter
    private String email;

    @Column(name = "password_hash")
    @Setter
    private String passwordHash;

    @Column(name = "role", nullable = false)
    @Setter
    private String role = Roles.Wire.BUYER;

    @Column(name = "team")
    @Setter
    private String team;

    @Column(name = "status", nullable = false)
    @Setter
    private String status = "active";

    @Column(name = "city")
    @Setter
    private String city;

    @Column(name = "mobile_verified", nullable = false)
    @Setter
    private boolean mobileVerified = false;

    @Column(name = "verified", nullable = false)
    @Setter
    private boolean verified = false;

    @Column(name = "verified_contact_only", nullable = false)
    @Setter
    private boolean verifiedContactOnly = false;

    @Column(name = "hide_number", nullable = false)
    @Setter
    private boolean hideNumber = false;

    @Column(name = "share_activity_status", nullable = false)
    @Setter
    private boolean shareActivityStatus = true;

    @Column(name = "share_read_receipts", nullable = false)
    @Setter
    private boolean shareReadReceipts = true;

    @Column(name = "listings_count", nullable = false)
    private int listingsCount = 0;

    @Column(name = "avatar")
    @Setter
    private String avatar;

    public static final int SELF_GENDER_CHANGES = 2;

    @Column(name = "gender")
    private String gender;

    @Column(name = "gender_changes", nullable = false, insertable = false, updatable = false)
    private int genderChanges;

    @CreationTimestamp
    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    @Column(name = "last_active")
    @Setter
    private Instant lastActive;

    // Written only by RefreshTokenService's native update, so an entity flush can never roll it back.
    @Column(name = "sessions_revoked_at", insertable = false, updatable = false)
    private Instant sessionsRevokedAt;

    @Column(name = "flagged", nullable = false)
    private boolean flagged = false;

    @Column(name = "flag_reason")
    private String flagReason;

    @Column(name = "flagged_at")
    private Instant flaggedAt;

    @Column(name = "flagged_by")
    private UUID flaggedBy;

    protected User() {
    }

    public User(String mobile, String role) {
        this.mobile = mobile;
        this.role = role;
    }

    public void flag(String reason, UUID by) {
        this.flagged = true;
        this.flagReason = reason;
        this.flaggedAt = Instant.now();
        this.flaggedBy = by;
    }

    public void clearFlag() {
        this.flagged = false;
        this.flagReason = null;
        this.flaggedAt = null;
        this.flaggedBy = null;
    }

    public void correctGender(String value) {
        gender = value;
    }

    public int genderChangesLeft() {
        return verified ? 0 : Math.max(0, SELF_GENDER_CHANGES - genderChanges);
    }

    public void recordListingPosted() {
        this.listingsCount++;
    }

    public void erasePersonalData(String pseudonymMobile) {
        this.mobile = pseudonymMobile;
        this.name = null;
        this.email = null;
        this.avatar = null;
        this.city = null;
        this.gender = null;

        this.passwordHash = null;
        this.mobileVerified = false;
        this.verified = false;
        this.lastActive = null;

        this.status = "archived";
        archive("Erased on the account holder's request (DPDP s.12(3))");
    }
}

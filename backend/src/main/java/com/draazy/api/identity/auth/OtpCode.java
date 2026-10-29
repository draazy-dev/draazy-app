package com.draazy.api.identity.auth;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "otp_codes")
@Getter
public class OtpCode extends BaseEntity {
    public static final String PURPOSE_LOGIN = "login";

    public static final String PURPOSE_OWNER_CONSENT = "owner-consent";

    public static final String PURPOSE_DRAFT_APPROVAL = "draft-approval";

    @Column(name = "mobile", nullable = false, updatable = false)
    private String mobile;

    @Column(name = "code_hash", nullable = false, updatable = false)
    private String codeHash;

    @Column(name = "purpose", nullable = false, updatable = false)
    private String purpose = PURPOSE_LOGIN;

    @Column(name = "attempts", nullable = false)
    private int attempts = 0;

    @Column(name = "consumed", nullable = false)
    private boolean consumed = false;

    @Column(name = "expires_at", nullable = false, updatable = false)
    private Instant expiresAt;

    @Column(name = "requested_by", updatable = false)
    private UUID requestedBy;

    protected OtpCode() {
    }

    public OtpCode(String mobile, String codeHash, String purpose, Instant expiresAt,
            UUID requestedBy) {
        this.mobile = mobile;
        this.codeHash = codeHash;
        this.purpose = purpose;
        this.expiresAt = expiresAt;
        this.requestedBy = requestedBy;
    }

    public void recordAttempt() {
        this.attempts++;
    }

    public void consume() {
        this.consumed = true;
    }

    public boolean isExpired() {
        return Instant.now().isAfter(expiresAt);
    }
}

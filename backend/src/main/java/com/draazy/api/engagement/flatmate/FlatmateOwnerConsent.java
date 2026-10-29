package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "flatmate_owner_consents")
@Getter
public class FlatmateOwnerConsent extends AuditedEntity {
    @Column(name = "owner_mobile", nullable = false, updatable = false)
    private String ownerMobile;

    @Column(name = "granted_by", nullable = false, updatable = false)
    private UUID grantedBy;

    @Column(name = "address_fingerprint", updatable = false)
    private String addressFingerprint;

    @Column(name = "granted_at", nullable = false)
    private Instant grantedAt = Instant.now();

    protected FlatmateOwnerConsent() {
    }
}

package com.draazy.api.billing.referral;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "referral_redeem_failures")
@Getter
public class ReferralRedeemFailure extends BaseEntity {
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "ip_hash", updatable = false)
    private String ipHash;

    protected ReferralRedeemFailure() {
    }

    ReferralRedeemFailure(UUID userId, String ipHash) {
        this.userId = userId;
        this.ipHash = ipHash;
    }
}

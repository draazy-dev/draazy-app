package com.draazy.api.billing.referral;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "referral_invites")
@Getter
public class ReferralInvite extends BaseEntity {
    static final String SENT = "sent";
    static final String OPEN_WHATSAPP = "open_whatsapp";
    static final String SKIPPED = "skipped";

    @Column(name = "referrer_id", nullable = false, updatable = false)
    private UUID referrerId;

    @Column(name = "mobile", nullable = false, updatable = false)
    private String mobile;

    @Column(name = "delivery", nullable = false, updatable = false)
    private String delivery;

    protected ReferralInvite() {
    }

    ReferralInvite(UUID referrerId, String mobile, String delivery) {
        this.referrerId = referrerId;
        this.mobile = mobile;
        this.delivery = delivery;
    }
}

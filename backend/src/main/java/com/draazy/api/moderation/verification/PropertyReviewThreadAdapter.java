package com.draazy.api.moderation.verification;

import com.draazy.api.common.trust.PropertyReviewThread;
import com.draazy.api.security.AuthPrincipal;
import org.springframework.stereotype.Component;

@Component
class PropertyReviewThreadAdapter implements PropertyReviewThread {
    private final PropertyVerificationService verification;

    PropertyReviewThreadAdapter(PropertyVerificationService verification) {
        this.verification = verification;
    }

    @Override
    public void post(AuthPrincipal actor, String propertyId, String body) {
        verification.addMessage(actor, propertyId, body, false);
    }
}

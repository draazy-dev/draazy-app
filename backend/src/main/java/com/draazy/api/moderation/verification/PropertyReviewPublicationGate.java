package com.draazy.api.moderation.verification;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyPublicationGate;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.security.AuthPrincipal;
import org.springframework.stereotype.Component;

@Component
public class PropertyReviewPublicationGate implements PropertyPublicationGate {

    private final PropertyReviewRepository reviews;
    private final VerificationCases cases;

    public PropertyReviewPublicationGate(PropertyReviewRepository reviews, VerificationCases cases) {
        this.reviews = reviews;
        this.cases = cases;
    }

    @Override
    public void requirePublishable(AuthPrincipal actor, Property property) {
        PropertyReview review = reviews.findByPropertyId(property.getId())
                .orElseThrow(() -> new ConflictException("checklist_incomplete",
                        "Open the review and tick every check first"));
        cases.reconcile(review);
        ApprovalGate.require(review, property);
    }
}

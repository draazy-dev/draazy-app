package com.draazy.api.moderation.verification;

import com.draazy.api.catalog.listing.RejectionAppeal;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class RejectionAppeals implements RejectionAppeal {

    private final PropertyReviewRepository reviews;

    RejectionAppeals(PropertyReviewRepository reviews) {
        this.reviews = reviews;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean mayResubmit(UUID propertyId) {
        return reviews.findByPropertyId(propertyId)
                .filter(review -> PropertyReviewStatuses.REJECTED.equals(review.getStatus()))
                .map(PropertyReview::getReasonCode)
                .map(ReviewReasonCodes.RESUBMITTABLE::contains)
                .orElse(false);
    }
}
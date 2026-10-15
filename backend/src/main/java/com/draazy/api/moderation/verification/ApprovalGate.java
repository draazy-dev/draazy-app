package com.draazy.api.moderation.verification;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.ReraCheck;
import com.draazy.api.common.error.ConflictException;
import java.util.List;

public final class ApprovalGate {

    private ApprovalGate() {
    }

    public static void require(PropertyReview review, Property property) {
        requireRera(property);
        List<String> open = review.getChecklist().stream()
                .filter(item -> !item.isPass())
                .map(ReviewChecklistItem::getItem)
                .toList();
        if (!open.isEmpty()) {
            throw new ConflictException("checklist_incomplete",
                    "Open the review and tick every check first");
        }
    }

    private static void requireRera(Property property) {
        if (property.getReraId() == null || property.getReraId().isBlank()) {
            return;
        }
        String check = property.getReraCheck();
        if (ReraCheck.failed(check)) {
            throw new ConflictException("rera_check_failed", ReraCheck.NOT_FOUND.equals(check)
                    ? "The RERA ID was not found on MahaRERA. Send the listing back or reject it instead."
                    : "The RERA ID does not match this project on MahaRERA. Send the listing back or reject it instead.");
        }
        if (!property.isReraVerified()) {
            throw new ConflictException("rera_check_pending",
                    "Check the RERA ID on MahaRERA and record the result first");
        }
    }
}

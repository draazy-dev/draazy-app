package com.draazy.api.moderation.property;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.catalog.property.PropertyLifecycle;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.ReferralTriggers;
import com.draazy.api.common.web.Ids;
import com.draazy.api.moderation.verification.ApprovalGate;
import com.draazy.api.moderation.verification.PropertyReview;
import com.draazy.api.moderation.verification.PropertyReviewRepository;
import com.draazy.api.moderation.verification.ReviewChecklistItem;
import com.draazy.api.moderation.verification.ReviewReasonCodes;
import com.draazy.api.moderation.verification.VerificationCases;
import com.draazy.api.security.AuthPrincipal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Every method writes an audit row because one user is changing another's listing.
@Service
public class PropertyModerationService {

    private static final Set<String> SETTABLE = Set.of(
            PropertyStatus.PENDING, PropertyStatus.APPROVED, PropertyStatus.REJECTED);

    private final PropertyRepository properties;
    private final AuditService audit;
    private final Notifier notifier;
    private final PropertyLifecycle lifecycle;
    private final VerificationCases cases;
    private final PropertyReviewRepository reviews;
    private final ReferralTriggers referralTriggers;

    public PropertyModerationService(PropertyRepository properties, AuditService audit,
            Notifier notifier, PropertyLifecycle lifecycle, VerificationCases cases,
            PropertyReviewRepository reviews, ReferralTriggers referralTriggers) {
        this.properties = properties;
        this.audit = audit;
        this.notifier = notifier;
        this.lifecycle = lifecycle;
        this.cases = cases;
        this.reviews = reviews;
        this.referralTriggers = referralTriggers;
    }

    @Transactional
    public Property setStatus(AuthPrincipal actor, String id, String status, String reason,
            String reasonCode, String expectedStatus) {
        if (!SETTABLE.contains(status)) {
            throw new BadRequestException("invalid_status", "status must be one of " + SETTABLE
                    + "; use /flag or /archive for the others");
        }
        Property property = load(id);
        lifecycle.requireChecker(actor, property);
        String from = property.getStatus();
        boolean clearingApprovedRecheck = PropertyStatus.APPROVED.equals(status)
                && PropertyStatus.APPROVED.equals(from) && property.isRecheckPending();
        if (PropertyStatus.APPROVED.equals(status)) {

            // Before anything is written, so a refusal costs the moderator nothing to retry.
            lifecycle.requireFiled(property);
        } else if (PropertyStatus.REJECTED.equals(status)) {
            ReviewReasonCodes.require("reject", reasonCode, reason);
        } else if (property.isArchived() || PropertyStatus.SOLD.equals(from) || PropertyStatus.RENTED.equals(from)) {
            throw new ConflictException("Restore or reopen this listing first");
        }
        requireExpected(from, expectedStatus, clearingApprovedRecheck);
        if (PropertyStatus.APPROVED.equals(status) && PropertyStatus.APPROVED.equals(from) && !clearingApprovedRecheck) {
            return property;
        }

        if (PropertyStatus.APPROVED.equals(status)) {

            /* Re-listing a home whose deal fell through is an approval, so return the row to the queue first
               and let the verification below be real. An archived listing has its own restore verb. */
            if (!property.isArchived() && (PropertyStatus.SOLD.equals(from) || PropertyStatus.RENTED.equals(from))) {
                lifecycle.reenterPending(actor, property);
            }

            // Not reenterPending: that resets the checklist, and an approval must stand on the ticks already made.
            if (PropertyStatus.REJECTED.equals(from)) {
                property.revertToPending();
            }
            PropertyReview review = cases.ensure(property.getId(), property.getDeal());
            ApprovalGate.require(review, property);
            if (!clearingApprovedRecheck) {
                if (review.getDecidedAt() == null || !PropertyStatus.APPROVED.equals(review.getStatus())) {
                    review.decide(PropertyStatus.APPROVED, actor.userId().toString(), reason, null);
                    reviews.saveAndFlush(review);
                }
                lifecycle.publish(actor, property);
            }
        } else if (PropertyStatus.REJECTED.equals(status)) {
            String normalizedReason = ReviewReasonCodes.require("reject", reasonCode, reason);
            PropertyReview review = cases.ensure(property.getId(), property.getDeal());
            review.decide(PropertyStatus.REJECTED, actor.userId().toString(), reason, normalizedReason);
            review.addMessage(actor.userId(), ReviewReasonCodes.rejectionThread(normalizedReason, reason));
            reviews.saveAndFlush(review);
            property.setStatus(status);
            referralTriggers.listingTakenDown(property.getId());
        } else {
            lifecycle.reenterPending(actor, property);
            if (PropertyStatus.REJECTED.equals(from)) {
                lifecycle.announceReopened(property);
            }
        }
        property.clearRecheck();
        audit.record(actor, "property.status", "property", id, "from", from, "to", property.getStatus(),
                "reason", reason, "reasonCode", reasonCode,
                "checklist", checklistSnapshot(property.getId()),
                "owner", String.valueOf(property.getOwner().getId()));

        // Only the two terminal verdicts are announced; a bounce back to `pending` is a queue move.
        // A rejected listing is not publicly viewable, so its link points at the dashboard.
        UUID ownerId = property.getOwner().getId();
        if (PropertyStatus.APPROVED.equals(status) && !clearingApprovedRecheck) {
            lifecycle.announceApproval(property);
        } else if (PropertyStatus.REJECTED.equals(status)) {
            notifier.notify(ownerId, "listing.rejected",
                    "Your listing was not approved",
                    "A moderator could not approve " + PropertyLifecycle.label(property) + ": "
                            + ReviewReasonCodes.rejectionMessage(reasonCode, reason),
                    PropertyLifecycle.reviewLink(property));
        }
        return property;
    }

    // Sets both status and flag_reason: the status delists, the reason is for humans.
    @Transactional
    public Property flag(AuthPrincipal actor, String id, String reason) {
        Property property = load(id);
        lifecycle.requireChecker(actor, property);

        String from = property.getStatus();
        property.setStatus(PropertyStatus.FLAGGED);
        property.setFlagReason(reason == null || reason.isBlank() ? "Flagged" : reason);
        referralTriggers.listingTakenDown(property.getId());
        audit.record(actor, "property.flag", "property", id, "from", from, "reason", reason,
                "owner", String.valueOf(property.getOwner().getId()));
        notifier.notify(property.getOwner().getId(), "listing.flagged",
                "Your listing has been taken down",
                "A moderator took down your listing. Contact support if you think this is a mistake.",
                "/dashboard");
        return property;
    }

    @Transactional
    public void clearFlag(AuthPrincipal actor, String id) {
        Property property = load(id);
        lifecycle.requireChecker(actor, property);
        if (!PropertyStatus.FLAGGED.equals(property.getStatus())) {
            throw new ConflictException("Listing is not flagged");
        }

        if (property.isArchived() || PropertyStatus.SOLD.equals(property.getStatus())
                || PropertyStatus.RENTED.equals(property.getStatus())) {
            property.setFlagReason(null);
            audit.record(actor, "property.flag.clear", "property", id, "from", property.getStatus(),
                    "owner", String.valueOf(property.getOwner().getId()));
            return;
        }

        String from = property.getStatus();
        property.setFlagReason(null);
        lifecycle.reenterPending(actor, property);
        audit.record(actor, "property.flag.clear", "property", id, "from", from, "to", property.getStatus(),
                "owner", String.valueOf(property.getOwner().getId()));
        notifier.notify(property.getOwner().getId(), "listing.unflagged", "Your listing is back under review",
                PropertyLifecycle.label(property) + " is no longer flagged and is back in the review queue.",
                PropertyLifecycle.reviewLink(property));
    }

    // A caller that does not name the status it saw may only decide a pending listing; otherwise the loser of
    // two concurrent verdicts would land on top of the winner's (approve then reject both succeeding).
    private static void requireExpected(String current, String expected, boolean clearingRecheck) {
        if (expected == null || expected.isBlank()) {
            if (!PropertyStatus.PENDING.equals(current) && !clearingRecheck) {
                throw new ConflictException("stale_decision",
                        "This listing is already " + current + "; send expectedStatus to change it");
            }
        } else if (!current.equals(expected)) {
            throw new ConflictException("stale_decision",
                    "Listing status changed; refresh before deciding");
        }
    }

    private Map<String, Boolean> checklistSnapshot(UUID propertyId) {
        return reviews.findByPropertyId(propertyId)
                .map(review -> {
                    Map<String, Boolean> snapshot = new LinkedHashMap<>();
                    for (ReviewChecklistItem item : review.getChecklist()) {
                        snapshot.put(item.getItem(), item.isPass());
                    }
                    return snapshot;
                })
                .orElseGet(Map::of);
    }

    /** The desk's read of one listing by id or slug, archived rows included; no lock, no write. */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public Property find(String idOrSlug) {
        return Ids.parseUuid(idOrSlug).flatMap(properties::findById)
            .or(() -> properties.findBySlug(idOrSlug))
            .orElseThrow(() -> NotFoundException.of("Property"));
    }

    private Property load(String idOrSlug) {
        UUID id = Ids.parseUuid(idOrSlug).orElseGet(() -> properties.findBySlug(idOrSlug)
            .map(Property::getId).orElseThrow(() -> NotFoundException.of("Property")));
        return properties.findForVerificationDecision(id)
            .orElseThrow(() -> NotFoundException.of("Property"));
    }
}

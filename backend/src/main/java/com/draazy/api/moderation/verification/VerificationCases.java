package com.draazy.api.moderation.verification;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyLifecycle;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.ListingCaseNotes;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

// Catalog reaches this through ListingCaseNotes because it may not import moderation.
@Service
public class VerificationCases implements ListingCaseNotes {

    // Rental has a lighter checklist because tenancy risk is lighter than sale risk.
    static final List<String> CHECKLIST = List.of(
            "Photos are real and match the listing",
            "Not a duplicate of another listing",
            "Details and location look right");

    // Present only on a listing that quotes a RERA ID; driven by the RERA check, never ticked by hand.
    static final String RERA_ITEM = "RERA ID checked on MahaRERA";

    private final PropertyReviewRepository reviews;
    private final AuditService audit;
    private final PropertyRepository properties;

    public VerificationCases(PropertyReviewRepository reviews, AuditService audit, PropertyRepository properties) {
        this.reviews = reviews;
        this.audit = audit;
        this.properties = properties;
    }

    // MANDATORY keeps case creation in the write that justified it and holds the lock.
    @Transactional(propagation = Propagation.MANDATORY)
    public PropertyReview ensure(UUID propertyId, String deal) {
        Optional<PropertyReview> existing = reviews.findByPropertyId(propertyId);
        if (existing.isPresent()) {
            PropertyReview review = existing.get();
            reconcilePendingChecklist(review);
            return review;
        }
        reviews.lockCaseFileFor(propertyId);
        return reviews.findByPropertyId(propertyId).orElseGet(() -> {
            PropertyReview created = new PropertyReview(propertyId);
            expectedChecklist(properties.findById(propertyId)).forEach(created::addChecklistItem);

            // saveAndFlush, not save: the checklist items are transient until insert, so plain save is
            // correct only until a checklist entry gains a generated id.
            return reviews.saveAndFlush(created);
        });
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void reconcile(PropertyReview review) {
        reconcilePendingChecklist(review);
    }

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void resetOnReentry(PropertyLifecycle.ReviewReentered event) {
        reviews.findByPropertyId(event.propertyId()).ifPresent(review -> {
            review.reopen();
            reconcilePendingChecklist(review);

            // After commit only: a refused decision rolls the reopen back, and its audit row must not outlive it.
            String propertyId = event.propertyId().toString();
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    audit.record(event.actorId(), event.actorRole(), "property.verification.checklist.reset",
                            "property", propertyId, null, "{}");
                }
            });
        });
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void requestInfo(UUID propertyId, String deal, UUID actorId, String note) {
        PropertyReview review = ensure(propertyId, deal);
        review.decide(PropertyReviewStatuses.NEEDS_INFO, actorId.toString(), note, "other");
        review.addMessage(actorId, note, true);
        reviews.saveAndFlush(review);
    }

    // Opens the case if absent because a note with nowhere to land warns nobody.
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void post(UUID propertyId, String deal, String body) {
        write(propertyId, deal, body, false);
    }

    // Staff-only because duplicate notes would otherwise reveal pending rows to owners.
    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void postInternalOnce(UUID propertyId, String deal, String body) {
        PropertyReview review = ensure(propertyId, deal);
        if (!reviews.hasInternalNote(review.getId(), body)) {
            write(propertyId, deal, body, true);
        }
    }

    private void write(UUID propertyId, String deal, String body, boolean internal) {
        PropertyReview review = ensure(propertyId, deal);
        if (internal) {
            review.addInternalNote(body);
        } else {
            review.addMessage(null, body);
        }

        // saveAndFlush: a new message is a transient child of a managed collection, so deferring the
        // persist to commit leaves its id and timestamp null for readers in the same transaction.
        reviews.saveAndFlush(review);
    }

    static List<ReviewChecklistItem> ordered(PropertyReview review) {
        return review.getChecklist().stream()
                .sorted(Comparator.comparingInt(item -> RERA_ITEM.equals(item.getItem())
                        ? CHECKLIST.size() : CHECKLIST.indexOf(item.getItem())))
                .toList();
    }

    private List<String> expectedChecklist(Optional<Property> property) {
        boolean quotesRera = property
                .map(p -> p.getReraId() != null && !p.getReraId().isBlank())
                .orElse(false);
        return quotesRera ? Stream.concat(CHECKLIST.stream(), Stream.of(RERA_ITEM)).toList() : CHECKLIST;
    }

    private void reconcilePendingChecklist(PropertyReview review) {
        if (review.getDecidedAt() != null && !PropertyReviewStatuses.NEEDS_INFO.equals(review.getStatus())) {
            return;
        }
        Optional<Property> property = properties.findById(review.getPropertyId());
        List<String> expected = expectedChecklist(property);
        List<String> items = review.getChecklist().stream().map(ReviewChecklistItem::getItem).toList();
        if (items.size() != expected.size() || !Set.copyOf(items).equals(Set.copyOf(expected))) {
            review.getChecklist().removeIf(item -> !expected.contains(item.getItem()));
            expected.stream().filter(item -> !items.contains(item)).forEach(review::addChecklistItem);
        }
        boolean verified = property.map(Property::isReraVerified).orElse(false);
        review.getChecklist().stream()
                .filter(item -> RERA_ITEM.equals(item.getItem()) && item.isPass() != verified)
                .forEach(item -> item.mark(verified, property.map(Property::getReraCheckedBy).orElse(null)));
    }
}

package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.PersonalDocumentLookup;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The badge desk: a reviewer's verdict on a host's tenancy evidence, separate from whether the post is shown. */
@Service
public class FlatmateBadgeReviewService {

    private final FlatmateReviewRepository reviews;
    private final UserRepository users;
    private final FlatmateBadges badges;
    private final Notifier notifier;
    private final AuditService audit;
    private final PersonalDocumentLookup personalDocuments;

    public FlatmateBadgeReviewService(FlatmateReviewRepository reviews, UserRepository users,
            FlatmateBadges badges, Notifier notifier, AuditService audit,
            PersonalDocumentLookup personalDocuments) {
        this.reviews = reviews;
        this.users = users;
        this.badges = badges;
        this.notifier = notifier;
        this.audit = audit;
        this.personalDocuments = personalDocuments;
    }

    /** Both filters run in the query rather than being re-applied in Java, which paging would turn
     * into short pages and a wrong {@code totalElements}. */
    @Transactional(readOnly = true)
    public Page<FlatmateReviewRow> queue(String status, Boolean flagged, Pageable pageable) {
        String filter = FlatmateVocabulary.optional(
                status, FlatmateVocabulary.REVIEW_STATUS, "status");

        Page<FlatmateReviewRepository.QueueRow> page = reviews.findForQueue(filter, flagged, pageable);

        Map<UUID, User> hosts = users.findAllById(page.getContent().stream()
                        .map(FlatmateReviewRepository.QueueRow::getHostId).distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        return page.map(r -> FlatmateReviewRow.of(r, hosts.get(r.getHostId())));
    }

    /** The only path to a tenant-tier badge, so it also needs owner consent, an ID-verified host and
     * the reviewer's document checks ({@link #requireConsentToApprove}). */
    @Transactional
    public FlatmateReviewDto decideReview(AuthPrincipal caller, UUID reviewId, String status,
            String reason, FlatmateReviewChecks checks) {
        String verdict = FlatmateVocabulary.require(
                status == null ? "" : status.strip(),
                Set.of("approved", "rejected"), "status");
        String why = FlatmateVocabulary.blankToNull(reason);
        if ("rejected".equals(verdict) && why == null) {
            throw new BadRequestException(
                    "A rejection needs a reason — the host is always told why.");
        }

        FlatmateReview review = reviews.findById(reviewId)
                .orElseThrow(() -> NotFoundException.of("Flatmate review"));
        badges.lockWithPost(review);
        FlatmateModerationService.requireNotParty(caller, badges.partiesOf(review));
        if (verdict.equals(review.getStatus())) {
            return reviewDto(review);
        }
        if (!FlatmateVocabulary.STATUS_PENDING.equals(review.getStatus())) {
            throw new ConflictException(
                    "This badge review is already decided. It reopens when the host edits the post.");
        }
        requireConsentToApprove(review, verdict);
        if (grantsBadge(review, verdict)) {
            requireVerifiedHost(review);
            LocalDate today = FlatmateReviewChecks.today();
            FlatmateReviewChecks given = checks == null
                    ? new FlatmateReviewChecks(null, null, null, null) : checks;
            review.approveChecked(why, caller.userId(),
                    given.validated(review.effectiveEvidenceType(), today), today);
        } else {
            review.decide(verdict, why, caller.userId());
        }
        reviews.saveAndFlush(review);

        boolean approved = "approved".equals(verdict);
        badges.apply(review, approved);
        tellHost(review, approved, why);

        audit.record(caller, "flatmate.review." + verdict, "flatmateReview",
                review.getId().toString(), "host", review.getHostId().toString(), "note", why);
        return reviewDto(review);
    }

    /** Rejected rather than a new status, so every reader of the badge already understands it; the host
     * is told why and can file fresh evidence. */
    @Transactional
    public FlatmateReviewDto revokeReview(AuthPrincipal caller, UUID reviewId, String reason) {
        String why = FlatmateVocabulary.blankToNull(reason);
        if (why == null) {
            throw new BadRequestException("A revocation needs a reason — the host is always told why.");
        }
        FlatmateReview review = reviews.findById(reviewId)
                .orElseThrow(() -> NotFoundException.of("Flatmate review"));
        badges.lockWithPost(review);
        FlatmateModerationService.requireNotParty(caller, badges.partiesOf(review));
        if (!FlatmateVocabulary.STATUS_APPROVED.equals(review.getStatus())) {
            throw new ConflictException("not_approved", "Only an approved badge can be revoked.");
        }
        review.revoke(why, caller.userId());
        reviews.saveAndFlush(review);
        badges.apply(review, false);
        notifier.notify(review.getHostId(), "flatmate.review.revoked",
                "Your Verified property badge was removed",
                "We removed the badge from your post. " + why, FlatmateLinks.of(review));
        audit.record(caller, "flatmate.review.revoke", "flatmateReview",
                review.getId().toString(), "host", review.getHostId().toString(), "note", why);
        return reviewDto(review);
    }

    /** Open while the review awaits a verdict and for 30 days after it, the window property
     * verification gives its own documents: a decision may be questioned, a closed case may not be browsed. */
    @Transactional
    public FlatmateReviewDocumentUrl documentUrl(AuthPrincipal caller, UUID reviewId) {
        FlatmateReview review = reviews.findById(reviewId)
                .orElseThrow(() -> NotFoundException.of("Flatmate review"));
        FlatmateModerationService.requireNotParty(caller, badges.partiesOf(review));
        boolean decided = !FlatmateVocabulary.STATUS_PENDING.equals(review.getStatus());
        if (decided && review.getUpdatedAt().plus(DOCUMENT_ACCESS_DAYS, ChronoUnit.DAYS).isBefore(Instant.now())) {
            throw new ForbiddenException("document_access_expired",
                    "Document access for this review has expired");
        }
        UUID documentId = review.getAgreementDoc() == null ? null
                : Ids.parseUuid(String.valueOf(review.getAgreementDoc().get("id"))).orElse(null);
        String url = personalDocuments.viewOwnedBy(documentId, review.getHostId())
                .map(view -> view.url())
                .orElseThrow(() -> NotFoundException.of("Document"));
        audit.record(caller, "flatmate.review.document.open", "flatmateReview",
                review.getId().toString(), "document", documentId.toString());
        return new FlatmateReviewDocumentUrl(url);
    }

    private static final int DOCUMENT_ACCESS_DAYS = 30;

    private FlatmateReviewDto reviewDto(FlatmateReview review) {
        String ownerMobile = badges.ownerMobileOf(review);
        return FlatmateReviewDto.of(review, users.findById(review.getHostId()).orElse(null),
                ownerMobile, ownerMobile == null ? null : users.findByMobileAndArchivedFalse(ownerMobile).orElse(null));
    }

    /** A sub-let without the owner's written consent is a ground for eviction under the Maharashtra
     * Rent Control Act 1999, so the badge is withheld — 422, because nothing about the caller fixes it. */
    private static void requireConsentToApprove(FlatmateReview review, String verdict) {
        if (!grantsBadge(review, verdict) || review.badgeable()) {
            return;
        }
        throw new ValidationException(
                "The flat's owner has not confirmed this sub-let, so the Verified property badge"
                        + " cannot be granted. Ask the host to send the owner a consent OTP;"
                        + " the row will say Consent verified once it is done.");
    }

    private static boolean grantsBadge(FlatmateReview review, String verdict) {
        return FlatmateVocabulary.STATUS_APPROVED.equals(verdict)
                && FlatmateVocabulary.TIER_TENANT.equals(review.getTier());
    }

    /** The host may have been un-verified since requesting; ID verification is judged at the moment of approval. */
    private void requireVerifiedHost(FlatmateReview review) {
        if (users.findById(review.getHostId()).filter(User::isVerified).isEmpty()) {
            throw new ValidationException(
                    "The host has not completed ID verification, so the Verified property badge cannot be granted."
                            + " Ask them to verify their ID first.");
        }
    }

    private void tellHost(FlatmateReview review, boolean approved, String reason) {
        notifier.notify(
                review.getHostId(),
                "flatmate.review." + (approved ? "approved" : "rejected"),
                approved ? "Your flatmate post is verified" : "We could not verify your flatmate post",
                approved
                        ? "Thanks — we have checked your agreement and your post now shows as verified."
                        : "We could not verify your post. " + reason,
                FlatmateLinks.of(review));
    }
}

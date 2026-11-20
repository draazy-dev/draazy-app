package com.draazy.api.moderation.verification;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.FlatmateCaseFiles;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateCases implements FlatmateCaseFiles {
    static final List<String> CHECKLIST = List.of(
            "Photos are real and match the post",
            "Not a duplicate of another post",
            "Details and location look right");

    private final PropertyReviewRepository reviews;

    public FlatmateCases(PropertyReviewRepository reviews) {
        this.reviews = reviews;
    }

    @Override
    @Transactional(readOnly = true)
    public void requireTicked(String kind, UUID postId) {
        boolean ticked = reviews.findByFlatmatePostId(postId)
                .map(review -> CHECKLIST.stream().allMatch(item -> passes(review, item)))
                .orElse(false);
        if (!ticked) {
            throw new ConflictException("checklist_incomplete", "Open the review and tick every check first");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public CaseView view(String kind, UUID postId, UUID hostId) {
        return reviews.findByFlatmatePostId(postId)
                .map(review -> toView(review, hostId))
                .orElseGet(() -> new CaseView(PropertyReviewStatuses.WIRE_IN_REVIEW, null, null,
                        CHECKLIST.stream().map(item -> new Check(item, false)).toList(), List.of(), null));
    }

    @Override
    @Transactional
    public void tick(String kind, UUID postId, UUID actorId, String item, boolean pass) {
        PropertyReview review = ensure(kind, postId);
        ReviewChecklistItem line = review.getChecklist().stream()
                .filter(entry -> entry.getItem().equals(item))
                .findFirst()
                .orElseThrow(() -> new NotFoundException("No such checklist item"));
        line.mark(pass, actorId);
        reviews.saveAndFlush(review);
    }

    @Override
    @Transactional
    public void needsInfo(String kind, UUID postId, UUID actorId, String reasonCode, String note) {
        String code = ReviewReasonCodes.require("needs_info", reasonCode, note);
        PropertyReview review = ensure(kind, postId);
        review.decide(PropertyReviewStatuses.NEEDS_INFO, actorId.toString(), note, code);
        review.addMessage(actorId, ReviewReasonCodes.ownerMessage(code, note), true);
        reviews.saveAndFlush(review);
    }

    @Override
    @Transactional
    public void approved(String kind, UUID postId, UUID actorId, String note) {
        PropertyReview review = ensure(kind, postId);
        review.decide(PropertyReviewStatuses.APPROVED, actorId.toString(), note, null);
        review.addApprovalMessage(actorId, note == null || note.isBlank()
                ? "Your post is live." : "Your post is live. " + note.trim());
        reviews.saveAndFlush(review);
    }

    @Override
    @Transactional
    public void rejected(String kind, UUID postId, UUID actorId, String reasonCode, String note) {
        String code = ReviewReasonCodes.require("reject", reasonCode, note);
        PropertyReview review = ensure(kind, postId);
        review.decide(PropertyReviewStatuses.REJECTED, actorId.toString(), note, code);
        review.addMessage(actorId, "\u26D4 Your post was taken down.\nReason: "
                + ReviewReasonCodes.rejectionMessage(code, note));
        reviews.saveAndFlush(review);
    }

    @Override
    @Transactional
    public void reply(String kind, UUID postId, UUID hostId, String body) {
        if (body == null || body.isBlank()) {
            throw new BadRequestException("body is required");
        }
        PropertyReview review = ensure(kind, postId);
        if (PropertyReviewStatuses.NEEDS_INFO.equals(review.getStatus())) {
            review.reopen();
        }
        review.addMessage(hostId, body.trim(), false);
        reviews.saveAndFlush(review);
    }

    @Override
    @Transactional
    public void reopen(String kind, UUID postId) {
        reviews.findByFlatmatePostId(postId).ifPresent(review -> {
            review.reopen();
            reviews.saveAndFlush(review);
        });
    }

    @Override
    @Transactional
    public void markRead(String kind, UUID postId, UUID hostId) {
        reviews.findByFlatmatePostId(postId).ifPresent(review -> review.getMessages().stream()
                .filter(message -> !message.isInternal() && !hostId.equals(message.getSenderId()))
                .forEach(ReviewMessage::markRead));
    }

    @Override
    @Transactional
    public void markHostMessagesRead(String kind, UUID postId, UUID hostId) {
        reviews.findByFlatmatePostId(postId).ifPresent(review -> review.getMessages().stream()
                .filter(message -> !message.isInternal() && hostId.equals(message.getSenderId()))
                .forEach(ReviewMessage::markRead));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, CaseSummary> summaries(Map<UUID, UUID> hostIdByPostId) {
        if (hostIdByPostId.isEmpty()) {
            return Map.of();
        }
        Map<UUID, CaseSummary> out = new HashMap<>();
        for (PropertyReview review : reviews.findByFlatmatePostIdIn(hostIdByPostId.keySet())) {
            UUID host = hostIdByPostId.get(review.getFlatmatePostId());
            out.put(review.getFlatmatePostId(), toSummary(review, host));
        }
        return out;
    }

    private PropertyReview ensure(String kind, UUID postId) {
        return reviews.findByFlatmatePostId(postId).orElseGet(() -> {
            reviews.lockCaseFileFor(postId);
            return reviews.findByFlatmatePostId(postId).orElseGet(() -> {
                PropertyReview created = PropertyReview.forFlatmate(kind, postId);
                CHECKLIST.forEach(created::addChecklistItem);
                return reviews.saveAndFlush(created);
            });
        });
    }

    private static boolean passes(PropertyReview review, String item) {
        return review.getChecklist().stream().anyMatch(entry -> entry.getItem().equals(item) && entry.isPass());
    }

    private static CaseView toView(PropertyReview review, UUID hostId) {
        List<Check> checks = CHECKLIST.stream().map(item -> new Check(item, passes(review, item))).toList();
        List<Message> messages = review.getMessages().stream()
                .filter(message -> !message.isInternal())
                .map(message -> new Message(message.getId().toString(),
                        hostId != null && hostId.equals(message.getSenderId()) ? "owner" : "ops",
                        message.getBody(), message.getCreatedAt(), message.getReadAt() != null,
                        message.isClarificationRequested()))
                .toList();
        return new CaseView(PropertyReviewStatuses.wire(review), review.getReasonCode(),
                showsReason(review) ? review.getNotes() : null, checks, messages, review.getDecidedAt());
    }

    private static CaseSummary toSummary(PropertyReview review, UUID hostId) {
        int forHost = 0;
        int fromHost = 0;
        for (ReviewMessage message : review.getMessages()) {
            if (message.isInternal() || message.getReadAt() != null) {
                continue;
            }
            if (hostId != null && hostId.equals(message.getSenderId())) {
                fromHost++;
            } else {
                forHost++;
            }
        }
        ReviewMessage last = review.getMessages().stream().filter(message -> !message.isInternal())
                .max(Comparator.comparing(ReviewMessage::getCreatedAt).thenComparing(ReviewMessage::getId))
                .orElse(null);
        return new CaseSummary(PropertyReviewStatuses.wire(review), review.getReasonCode(),
                showsReason(review) ? review.getNotes() : null, forHost, fromHost,
                last == null ? review.getCreatedAt() : last.getCreatedAt(),
                last == null ? null : last.getBody());
    }

    private static boolean showsReason(PropertyReview review) {
        String status = PropertyReviewStatuses.wire(review);
        return PropertyReviewStatuses.NEEDS_INFO.equals(status)
                || PropertyReviewStatuses.REJECTED.equals(status);
    }
}

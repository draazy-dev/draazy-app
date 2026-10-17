package com.draazy.api.engagement.flatmate;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Shared by {@link FlatmateModerationService} (a moderator's verdict) and
 * {@code FlatmateTrustReconciler} (a scheduled one), so the badge rule lives in exactly one place. */
@Component
class FlatmateBadges {

    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final EntityManager em;

    FlatmateBadges(FlatmateRoomRepository rooms, FlatmateGroupRepository groups, EntityManager em) {
        this.rooms = rooms;
        this.groups = groups;
        this.em = em;
    }

    /** Post before review, the order a host edit takes, so the two never deadlock. The review is re-read
     * under the lock, since a caller may already hold a copy read without it. */
    void lockWithPost(FlatmateReview review) {
        if (review.getRoomId() != null) {
            rooms.findLockedById(review.getRoomId());
        } else if (review.getGroupId() != null) {
            groups.findLockedById(review.getGroupId());
        }
        em.refresh(review, LockModeType.PESSIMISTIC_WRITE);
    }

    UUID[] partiesOf(FlatmateReview review) {
        return Optional.ofNullable(review.getGroupId()).flatMap(groups::findById)
                .map(FlatmateGroup::parties).orElseGet(() -> new UUID[] {review.getHostId()});
    }

    /** {@link #stillClaimed} stops a stale review deciding a post edited since. Only an approval
     * clears {@code flagForReview} — only that verdict read the rival address claim and dismissed it. */
    void apply(FlatmateReview review, boolean approved) {
        String tier = tierAfter(review, approved);
        if (review.getRoomId() != null) {
            rooms.findLockedById(review.getRoomId())
                    .filter(room -> stillClaimed(review, room.getVerificationTier()))
                    .ifPresent(room -> {
                        room.setVerificationTier(tier);
                        if (approved) {
                            room.setFlagForReview(false);
                        }
                        rooms.saveAndFlush(room);
                    });
        } else if (review.getGroupId() != null) {
            groups.findLockedById(review.getGroupId())
                    .filter(group -> stillClaimed(review, group.getVerificationTier()))
                    .ifPresent(group -> {
                        group.setVerificationTier(tier);
                        if (approved) {
                            group.setFlagForReview(false);
                        }
                        groups.saveAndFlush(group);
                    });
        }
    }

    private static boolean stillClaimed(FlatmateReview review, String postTier) {
        return postTier != null && postTier.equals(review.getTier());
    }

    /** Only a tenant claim can be answered with a tier: an identity-tier post is queued over a rival
     * address claim, and promoting on that would mint a badge its host never asked for. */
    private static String tierAfter(FlatmateReview review, boolean approved) {
        boolean claimedAgreement = FlatmateVocabulary.TIER_TENANT.equals(review.getTier());
        return approved && claimedAgreement
                ? FlatmateVocabulary.TIER_TENANT : FlatmateVocabulary.TIER_IDENTITY;
    }
}

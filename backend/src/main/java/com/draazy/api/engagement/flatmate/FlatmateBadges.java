package com.draazy.api.engagement.flatmate;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

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

    // Lock the post before the review, the order a host edit takes, or the two paths deadlock.
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

    String ownerMobileOf(FlatmateReview review) {
        if (review.getRoomId() != null) {
            return rooms.findById(review.getRoomId()).map(FlatmateRoom::getOwnerConsentMobile).orElse(null);
        }
        return Optional.ofNullable(review.getGroupId()).flatMap(groups::findById)
                .map(FlatmateGroup::getOwnerConsentMobile).orElse(null);
    }

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

    private static String tierAfter(FlatmateReview review, boolean approved) {
        boolean claimedAgreement = FlatmateVocabulary.TIER_TENANT.equals(review.getTier());
        return approved && claimedAgreement
                ? FlatmateVocabulary.TIER_TENANT : FlatmateVocabulary.TIER_IDENTITY;
    }
}

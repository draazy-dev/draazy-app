package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.trust.FlatmateCaseFiles;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
class FlatmatePublication {
    static final String UNREVIEWED = "new post";

    private final FlatmateGuardrails guardrails;
    private final FlatmateReviewRepository reviews;
    private final FlatmateCaseFiles caseFiles;

    FlatmatePublication(FlatmateGuardrails guardrails, FlatmateReviewRepository reviews,
            FlatmateCaseFiles caseFiles) {
        this.guardrails = guardrails;
        this.reviews = reviews;
        this.caseFiles = caseFiles;
    }

    void enqueueReviewIfNeeded(AuthPrincipal caller, String kind, UUID roomId, UUID groupId,
            String tier, boolean flagged, String address, AgreementClaim claim) {
        if (FlatmateVocabulary.TIER_OWNER.equals(tier)) {
            return;
        }
        boolean needsReview = FlatmateVocabulary.TIER_TENANT.equals(tier) || flagged;
        if (!needsReview) {
            return;
        }
        var standing = roomId != null ? reviews.findByRoomId(roomId) : reviews.findByGroupId(groupId);
        if (standing.isPresent()) {
            standing.get().reopenAfterEdit(address, tier, flagged, claim.ownerConsent(),
                claim.doc(), claim.registration(), claim.tenancyPropertyId(), claim.evidenceType());
            reviews.saveAndFlush(standing.get());
            return;
        }
        reviews.saveAndFlush(new FlatmateReview(kind, roomId, groupId, caller.userId(), address,
            tier, flagged, claim.ownerConsent(), claim.doc(), claim.registration(),
            claim.tenancyPropertyId(), claim.evidenceType()));
    }

    record AgreementClaim(Map<String, Object> doc, AgreementRegistration registration,
            boolean ownerConsent, UUID tenancyPropertyId, String evidenceType) {
    }

    String stateFor(String tier, boolean flagged, boolean flatless) {
        if (!flagged && (flatless || FlatmateVocabulary.TIER_OWNER.equals(tier))) {
            return FlatmateVocabulary.MOD_LIVE;
        }
        return FlatmateVocabulary.MOD_PENDING;
    }

    static void queueUnreviewed(ModerationRecheck recheck, String state, boolean flatless) {
        if (flatless) {
            recheck.settle(state, List.of(UNREVIEWED));
        }
    }

    void reapplyAfterEdit(AuthPrincipal caller, String tier, FlatmateEditImpact impact,
            FlatmateSupplyPost post, FlatmateGuardrails.Address address) {
        var eligibility = guardrails.evaluate(caller.userId(), tier, address);
        post.setAddressFingerprint(eligibility.fingerprint());
        post.setFlagForReview(eligibility.flagForReview());
        post.setModStatus(post.getExpiry().revive(post.getModStatus()));
        String standing = post.getModStatus();
        boolean wasPublic = FlatmateVocabulary.isPublic(standing);
        boolean selfPublished = FlatmateVocabulary.MOD_LIVE.equals(standing);
        boolean flatless = post instanceof FlatmateGroup group && group.isHunting();
        String ladder = stateFor(tier, eligibility.flagForReview(), flatless);
        boolean photoLessRoom = post instanceof FlatmateRoom room && room.getPhotos().isEmpty();
        boolean lowered = impact.remoderationRequired() || !wasPublic || photoLessRoom
            || eligibility.flagForReview()
            || (selfPublished && FlatmateVocabulary.MOD_PENDING.equals(ladder));
        String state = lowered ? FlatmateVocabulary.MOD_PENDING : standing;
        post.setModStatus(state);
        post.getRecheck().settle(state, impact.rechecked());
        if (lowered) {
            caseFiles.reopen(post instanceof FlatmateRoom ? FlatmateCaseFiles.KIND_ROOM
                    : FlatmateCaseFiles.KIND_GROUP, post.getId());
        }
    }
}

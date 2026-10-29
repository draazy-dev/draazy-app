package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.RegisteredTenancyLookup;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateTrustReconciler {
    private final FlatmateReviewRepository reviews;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final PropertyRepository properties;
    private final RegisteredTenancyLookup agreements;
    private final UserRepository users;
    private final FlatmateBadges badges;
    private final Notifier notifier;

    public FlatmateTrustReconciler(FlatmateReviewRepository reviews, FlatmateRoomRepository rooms,
            FlatmateGroupRepository groups,
            PropertyRepository properties, RegisteredTenancyLookup agreements,
            UserRepository users, FlatmateBadges badges, Notifier notifier) {
        this.reviews = reviews;
        this.rooms = rooms;
        this.groups = groups;
        this.properties = properties;
        this.agreements = agreements;
        this.users = users;
        this.badges = badges;
        this.notifier = notifier;
    }

    @Transactional
    public int reconcileOwnerTier() {
        List<FlatmateRoom> staleRooms = rooms.findOwnerTierClaims().stream()
                .filter(r -> !listingStands(r.getAddressFingerprint())).toList();
        staleRooms.forEach(r -> {
            r.setVerificationTier(fallbackTier(r.isAgreementDeclared()));
            holdForReview(r, r.getHostId(), FlatmateLinks.of("room", r.getId()));
        });
        rooms.saveAllAndFlush(staleRooms);

        List<FlatmateGroup> staleGroups = groups.findOwnerTierClaims().stream()
                .filter(g -> !listingStands(g.getAddressFingerprint())).toList();
        staleGroups.forEach(g -> {
            g.setVerificationTier(fallbackTier(g.isAgreementDeclared()));
            holdForReview(g, g.getHostId(), FlatmateLinks.of("group", g.getId()));
        });
        groups.saveAllAndFlush(staleGroups);

        return staleRooms.size() + staleGroups.size();
    }

    private void holdForReview(FlatmateSupplyPost post, UUID hostId, String link) {
        boolean live = FlatmateVocabulary.MOD_LIVE.equals(post.getModStatus());
        if (live || post.getExpiry().holdForReview()) {
            if (live) {
                post.setModStatus(FlatmateVocabulary.MOD_PENDING);
            }
            post.getRecheck().clear();
            notifier.notify(hostId, "flatmate.moderated.held", "Your flatmate ad is back in review",
                    "The listing it was linked to is no longer live, so our team will check the ad"
                            + " before it shows again.", link);
        }
    }

    private boolean listingStands(String fingerprint) {
        return Ids.parseUuid(fingerprint.substring(FlatmateGuardrails.PROPERTY_PREFIX.length()))
                .flatMap(properties::findById)
                .filter(p -> PropertyStatus.APPROVED.equals(p.getStatus()) && !p.isArchived())
                .filter(Property::isOwnershipVerified)
                .isPresent();
    }

    private static String fallbackTier(boolean agreementDeclared) {
        return agreementDeclared ? FlatmateVocabulary.TIER_TENANT : FlatmateVocabulary.TIER_IDENTITY;
    }

    @Transactional
    public int reconcileAgreementExpiry() {
        List<FlatmateReview> lapsed = new ArrayList<>();
        for (FlatmateReview review : reviews.findLapsedApprovals(FlatmateReviewChecks.today())) {
            badges.lockWithPost(review);
            if (!FlatmateVocabulary.STATUS_APPROVED.equals(review.getStatus())) {
                continue;
            }
            review.expire(review.getAgreement().getValidTill());
            badges.apply(review, false);
            notifier.notify(review.getHostId(), "flatmate.review.expired",
                    "Your flatmate verification has expired",
                    review.getReason(), FlatmateLinks.of(review));
            lapsed.add(review);
        }
        reviews.saveAllAndFlush(lapsed);
        return lapsed.size();
    }

    @Transactional
    public int reconcileDraazyAgreements() {
        List<FlatmateReview> decided = new ArrayList<>();
        for (FlatmateReview review : reviews.findConsentedTenantBacklog()) {
            if (!review.badgeable() || review.getAgreement().expiredOn(FlatmateReviewChecks.today())) {
                continue;
            }
            badges.lockWithPost(review);
            if (!FlatmateVocabulary.STATUS_PENDING.equals(review.getStatus()) || !review.badgeable()) {
                continue;
            }
            UUID propertyId = propertyBehind(review);
            if (propertyId == null) {
                continue;
            }
            User host = users.findById(review.getHostId()).orElse(null);
            if (host == null || !host.isVerified() || host.getMobile() == null
                    || !agreements.hasRegisteredTenancy(propertyId, host.getMobile())) {
                continue;
            }
            review.decide(FlatmateVocabulary.STATUS_APPROVED,
                    "Verified against the Leave & License agreement Draazy registered for this"
                            + " flat.", null);
            badges.apply(review, true);
            notifier.notify(review.getHostId(), "flatmate.review.approved",
                    "Your flatmate post is now a Verified property",
                    "We matched it to the rent agreement we registered for you, so there was"
                            + " nothing left for our team to check.", FlatmateLinks.of(review));
            decided.add(review);
        }
        reviews.saveAllAndFlush(decided);
        return decided.size();
    }

    private UUID propertyBehind(FlatmateReview review) {
        UUID claimed = review.getTenancyPropertyId();
        if (claimed == null) {
            return null;
        }

        Property property = properties.findById(claimed).orElse(null);
        if (property == null) {
            return null;
        }
        UUID postedSociety = postedSocietyId(review);
        if (postedSociety != null && property.getSocietyId() != null) {
            return postedSociety.equals(property.getSocietyId()) ? claimed : null;
        }
        String posted = postedLocality(review);
        String claimedLocality = FlatmateVocabulary.blankToNull(property.getLocality());
        return posted != null && posted.equalsIgnoreCase(claimedLocality) ? claimed : null;
    }

    private UUID postedSocietyId(FlatmateReview review) {
        if (review.getRoomId() != null) {
            return rooms.findById(review.getRoomId()).map(FlatmateRoom::getSocietyId).orElse(null);
        }
        if (review.getGroupId() == null) {
            return null;
        }
        return groups.findById(review.getGroupId()).map(FlatmateGroup::getPropertyId)
                .flatMap(properties::findById).map(Property::getSocietyId).orElse(null);
    }

    private String postedLocality(FlatmateReview review) {
        if (review.getRoomId() != null) {
            return rooms.findById(review.getRoomId())
                    .map(r -> FlatmateVocabulary.blankToNull(r.getLocality())).orElse(null);
        }
        if (review.getGroupId() != null) {
            return groups.findById(review.getGroupId())
                    .map(g -> FlatmateVocabulary.blankToNull(g.getLocality())).orElse(null);
        }
        return null;
    }
}

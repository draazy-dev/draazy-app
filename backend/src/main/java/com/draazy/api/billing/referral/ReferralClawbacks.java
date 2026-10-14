package com.draazy.api.billing.referral;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.user.UserStatuses;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** Rejects a held referral or claws back a granting one inside the window; {@link #recheck} is the sweep backstop. */
@Service
public class ReferralClawbacks {

    static final String REFEREE_SUSPENDED = "referee_suspended";
    static final String LISTING_TAKEN_DOWN = "listing_taken_down";
    static final String VERIFICATION_REVOKED = "verification_revoked";
    static final String LISTING_NOT_LIVE = "listing_not_live";
    static final String SELF_DEALING = "self_dealing";

    private static final Map<String, String> REASONS = Map.of(
            REFEREE_SUSPENDED, "the referred account was suspended",
            LISTING_TAKEN_DOWN, "the qualifying listing was taken down",
            VERIFICATION_REVOKED, "the listing's ownership verification was withdrawn",
            LISTING_NOT_LIVE, "the qualifying listing is no longer live",
            SELF_DEALING, "the referrer approved the contact");

    private final ReferralRepository referrals;
    private final UserRepository users;
    private final PropertyRepository properties;
    private final PlatformSettings settings;
    private final ReferralOutcomes outcomes;

    public ReferralClawbacks(ReferralRepository referrals, UserRepository users, PropertyRepository properties,
            PlatformSettings settings, ReferralOutcomes outcomes) {
        this.referrals = referrals;
        this.users = users;
        this.properties = properties;
        this.settings = settings;
        this.outcomes = outcomes;
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void onRefereeSuspended(UUID userId) {
        referrals.findLiveForReferee(userId).ifPresent(r -> take(r, REFEREE_SUSPENDED));
    }

    // A seeker row's property is a third party's listing the friend contacted: only moderation calling it
    // fake (rejected or flagged) counts against the row, never an archive or a withdrawn verification.
    @Transactional(propagation = Propagation.REQUIRED)
    public void onListingTakenDown(UUID propertyId) {
        boolean fake = properties.findById(propertyId).map(ReferralClawbacks::isFake).orElse(false);
        referrals.findLiveForProperty(propertyId).stream()
                .filter(r -> isOwnerTrack(r) || fake)
                .forEach(r -> take(r, LISTING_TAKEN_DOWN));
    }

    @Transactional(propagation = Propagation.REQUIRED)
    public void onOwnershipRevoked(UUID propertyId) {
        referrals.findLiveForProperty(propertyId).stream()
                .filter(ReferralClawbacks::isOwnerTrack)
                .forEach(r -> take(r, VERIFICATION_REVOKED));
    }

    // A staff override is a later decision than any problem the sweep can see, so it is left alone.
    @Transactional
    public void recheck(UUID referralId) {
        referrals.findForDecision(referralId)
                .filter(r -> r.getHandledBy() == null || ReferralStatuses.SYSTEM.equals(r.getHandledBy()))
                .ifPresent(r -> {
                    String problem = problem(r, false);
                    if (problem != null) {
                        take(r, problem);
                    }
                });
    }

    boolean withinWindow(Referral referral, Instant now) {
        return referral.getGrantedAt() != null && referral.getGrantedAt()
                .plus(Duration.ofDays(settings.referralClawbackDays())).isAfter(now);
    }

    /** The reason this referral must stop earning, or null; {@code needLive} adds the owner-track archive check. */
    String problem(Referral referral, boolean needLive) {
        var referee = users.findByMobile(referral.getReferredMobile());
        if (referee.isPresent() && UserStatuses.SUSPENDED.equals(referee.get().getStatus())) {
            return REFEREE_SUSPENDED;
        }
        if (referral.getTrack() == null || referral.getQualifiedPropertyId() == null) {
            return null;
        }
        Property property = properties.findById(referral.getQualifiedPropertyId()).orElse(null);
        if (!isOwnerTrack(referral)) {
            if (property == null) {
                return null;
            }
            if (isFake(property)) {
                return LISTING_TAKEN_DOWN;
            }
            return property.getOwner().getId().equals(referral.getReferrerId()) ? SELF_DEALING : null;
        }
        if (property == null) {
            return LISTING_NOT_LIVE;
        }
        if (isFake(property)) {
            return LISTING_TAKEN_DOWN;
        }
        if (property.getOwnershipVerifiedAt() == null) {
            return VERIFICATION_REVOKED;
        }
        return needLive && property.isArchived() ? LISTING_NOT_LIVE : null;
    }

    private static boolean isOwnerTrack(Referral referral) {
        return ReferralStatuses.TRACK_OWNER.equals(referral.getTrack());
    }

    private static boolean isFake(Property property) {
        String status = property.getStatus();
        return PropertyStatus.REJECTED.equals(status) || PropertyStatus.FLAGGED.equals(status);
    }

    private void take(Referral referral, String reason) {
        String sentence = "Automatic: " + REASONS.get(reason);
        if (ReferralStatuses.HELD.equals(referral.getStatus())) {
            outcomes.rejected(referral, reason, sentence,
                    "A referral did not count because " + REASONS.get(reason) + ".");
        } else if (ReferralStatuses.isGranting(referral.getStatus()) && withinWindow(referral, Instant.now())) {
            outcomes.clawedBack(referral, reason, REASONS.get(reason));
        }
    }
}

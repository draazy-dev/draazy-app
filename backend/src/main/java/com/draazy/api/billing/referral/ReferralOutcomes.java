package com.draazy.api.billing.referral;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.Notifier;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/** Applies an automatic decision: status move, friend's Featured window, system audit row and referrer notice. */
@Component
class ReferralOutcomes {

    private static final String REFER_LINK = "/refer";

    private final ReferralRepository referrals;
    private final PropertyRepository properties;
    private final PlatformSettings settings;
    private final AuditService audit;
    private final Notifier notifier;

    ReferralOutcomes(ReferralRepository referrals, PropertyRepository properties, PlatformSettings settings,
            AuditService audit, Notifier notifier) {
        this.referrals = referrals;
        this.properties = properties;
        this.settings = settings;
        this.audit = audit;
        this.notifier = notifier;
    }

    void granted(Referral referral, String sentence) {
        referral.autoGrant(sentence);
        grantFeatured(referral);
        record(referral, "qualified");
    }

    void held(Referral referral, Instant until, String sentence) {
        referral.autoHold(until, sentence);
        grantFeatured(referral);
        record(referral, "held");
    }

    void released(Referral referral, String sentence) {
        referral.autoGrant(sentence);
        record(referral, "released");
    }

    void rejected(Referral referral, String reason, String sentence, String notice) {
        boolean wasHeld = ReferralStatuses.HELD.equals(referral.getStatus());
        referral.autoReject(reason, sentence);
        if (wasHeld) {
            clearFeatured(referral);
        }
        record(referral, "rejected");
        tellReferrer(referral, "Referral could not be verified", notice);
    }

    void clawedBack(Referral referral, String reason, String because) {
        referral.autoClawBack(reason, "Automatic: " + because);
        clearFeatured(referral);
        record(referral, "clawback");
        tellReferrer(referral, "Referral reward withdrawn",
                "A referral reward was withdrawn because " + because + ". Contact support if you think this is wrong.");
    }

    // Staff overrides move the status by hand; the friend's Featured window follows the new status.
    void syncFeatured(Referral referral) {
        if (ReferralStatuses.isGranting(referral.getStatus())) {
            grantFeatured(referral);
        } else {
            clearFeatured(referral);
        }
    }

    private void grantFeatured(Referral referral) {
        if (ReferralStatuses.TRACK_OWNER.equals(referral.getTrack()) && referral.getQualifiedPropertyId() != null) {
            properties.setFeaturedDays(referral.getQualifiedPropertyId(),
                    Math.toIntExact(settings.referralOwnerFeaturedDays()));
        }
    }

    private void clearFeatured(Referral referral) {
        if (ReferralStatuses.TRACK_OWNER.equals(referral.getTrack()) && referral.getQualifiedPropertyId() != null) {
            properties.setFeaturedDays(referral.getQualifiedPropertyId(), null);
        }
    }

    private void record(Referral referral, String outcome) {
        referrals.saveAndFlush(referral);
        Map<String, Object> detail = new HashMap<>();
        detail.put("track", referral.getTrack());
        detail.put("risk", referral.getRisk());
        detail.put("reason", referral.getAutoReason());
        audit.record(ReferralStatuses.SYSTEM, "admin", "referral.auto." + outcome, "referral",
                referral.getId().toString(), detail);
    }

    private void tellReferrer(Referral referral, String title, String body) {
        notifier.notify(referral.getReferrerId(), "referral.outcome", title, body, REFER_LINK);
    }
}

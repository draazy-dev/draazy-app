package com.draazy.api.billing.referral;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.Notifier;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

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
        tellReferrer(referral, "Your friend joined Draazy", earnedNotice());
    }

    void held(Referral referral, Instant until, String sentence) {
        referral.autoHold(until, sentence);
        record(referral, "held");
        tellReferrer(referral, "We're checking a referral",
                "Your friend joined Draazy. We're doing a quick check, and you'll hear from us within "
                        + settings.referralHoldDays() + " days.");
    }

    void released(Referral referral, String sentence) {
        referral.autoGrant(sentence);
        grantFeatured(referral);
        record(referral, "released");
        tellReferrer(referral, "Your friend joined Draazy", earnedNotice());
    }

    void rejected(Referral referral, String reason, String sentence, String notice) {
        referral.autoReject(reason, sentence);
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

    void decidedByStaff(Referral referral) {
        syncFeatured(referral);
        switch (referral.getStatus()) {
            case ReferralStatuses.REWARDED -> tellReferrer(referral, "Your friend joined Draazy", earnedNotice());
            case ReferralStatuses.REJECTED -> tellReferrer(referral, "Referral could not be verified",
                    "A referral did not count after review. Contact support if you think this is wrong.");
            case ReferralStatuses.CLAWED_BACK -> tellReferrer(referral, "Referral reward withdrawn",
                    "A referral reward was withdrawn after review. Contact support if you think this is wrong.");
            default -> { }
        }
    }

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

    private String earnedNotice() {
        return "Your friend joined. You've earned " + settings.referralAgreementDiscountPercent()
                + "% off the service fee on your next rent agreement.";
    }

    private void tellReferrer(Referral referral, String title, String body) {
        notifier.notify(referral.getReferrerId(), "referral.outcome", title, body, REFER_LINK);
    }
}

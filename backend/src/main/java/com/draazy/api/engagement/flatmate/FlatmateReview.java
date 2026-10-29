package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.persistence.AuditedEntity;
import com.draazy.api.common.trust.OwnedDocumentLookup;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "flatmate_reviews")
@Getter
public class FlatmateReview extends AuditedEntity {
    @Column(name = "kind", nullable = false, updatable = false)
    private String kind;

    @Column(name = "room_id", updatable = false)
    private UUID roomId;

    @Column(name = "group_id", updatable = false)
    private UUID groupId;

    @Column(name = "host_id", nullable = false, updatable = false)
    private UUID hostId;

    @Column(name = "address")
    private String address;

    @Column(name = "tier", nullable = false)
    private String tier;

    @Column(name = "flag_for_review", nullable = false)
    private boolean flagForReview = false;

    @Column(name = "owner_consent", nullable = false)
    private boolean ownerConsent = false;

    @Column(name = "tenancy_property_id")
    private UUID tenancyPropertyId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "agreement_doc")
    private Map<String, Object> agreementDoc;

    @Embedded
    private AgreementRegistration agreement = new AgreementRegistration();

    AgreementRegistration getAgreement() {
        return agreement == null ? new AgreementRegistration() : agreement;
    }

    @Column(name = "evidence_type")
    private String evidenceType;

    @Column(name = "evidence_issued_on")
    private LocalDate evidenceIssuedOn;

    @Column(name = "name_matches")
    private Boolean nameMatches;

    @Column(name = "address_matches")
    private Boolean addressMatches;

    @Column(name = "status", nullable = false)
    private String status = FlatmateVocabulary.STATUS_PENDING;

    @Column(name = "reason")
    private String reason;

    @Column(name = "decided_by")
    private UUID decidedBy;

    protected FlatmateReview() {
    }

    FlatmateReview(String kind, UUID roomId, UUID groupId, UUID hostId, String address,
            String tier, boolean flagForReview, boolean ownerConsent,
            Map<String, Object> agreementDoc, AgreementRegistration agreement,
            UUID tenancyPropertyId) {
        this(kind, roomId, groupId, hostId, address, tier, flagForReview, ownerConsent, agreementDoc,
                agreement, tenancyPropertyId, null);
    }

    FlatmateReview(String kind, UUID roomId, UUID groupId, UUID hostId, String address,
            String tier, boolean flagForReview, boolean ownerConsent,
            Map<String, Object> agreementDoc, AgreementRegistration agreement,
            UUID tenancyPropertyId, String evidenceType) {
        this.evidenceType = evidenceType;
        this.kind = kind;
        this.roomId = roomId;
        this.groupId = groupId;
        this.hostId = hostId;
        this.address = address;
        this.tier = tier;
        this.flagForReview = flagForReview;
        this.ownerConsent = ownerConsent;
        this.agreementDoc = agreementDoc;
        this.agreement = agreement;
        this.tenancyPropertyId = tenancyPropertyId;
    }

    static final int BADGE_MONTHS = 11;

    void decide(String decision, String why, UUID decider) {
        this.status = decision;
        this.reason = why;
        this.decidedBy = decider;
        AgreementRegistration current = getAgreement();
        if (FlatmateVocabulary.STATUS_APPROVED.equals(decision)
                && FlatmateVocabulary.TIER_TENANT.equals(tier) && current.getValidTill() == null) {
            this.agreement = new AgreementRegistration(FlatmateReviewChecks.today().plusMonths(BADGE_MONTHS));
        }
    }

    void reopenAfterEdit(String address, String tier, boolean flagForReview, boolean ownerConsent,
            Map<String, Object> agreementDoc, AgreementRegistration agreement,
            UUID tenancyPropertyId, String evidenceType) {
        this.address = address;
        this.tier = tier;
        this.flagForReview = flagForReview;
        this.ownerConsent = ownerConsent;

        if (!namesStoredFile(agreementDoc)) {
            this.agreementDoc = agreementDoc;
            this.agreement = agreement;
            this.evidenceType = evidenceType;
        }
        clearChecks();
        this.tenancyPropertyId = tenancyPropertyId;
        this.status = FlatmateVocabulary.STATUS_PENDING;
        this.reason = null;
        this.decidedBy = null;
    }

    private void clearChecks() {
        this.nameMatches = null;
        this.addressMatches = null;
        this.evidenceIssuedOn = null;
    }

    private boolean namesStoredFile(Map<String, Object> doc) {
        return doc != null && this.agreementDoc != null && doc.get("dataUrl") == null
                && !doc.containsKey(AgreementPeriod.TILL)
                && doc.get("id") != null && doc.get("id").equals(this.agreementDoc.get("id"));
    }

    void approveChecked(String why, UUID decider, FlatmateReviewChecks checks, LocalDate today) {
        this.status = FlatmateVocabulary.STATUS_APPROVED;
        this.reason = why;
        this.decidedBy = decider;
        this.nameMatches = checks.nameMatches();
        this.addressMatches = checks.addressMatches();
        this.evidenceIssuedOn = checks.issuedOn();
        this.agreement = new AgreementRegistration(checks.badgeUntil(effectiveEvidenceType(), today));
    }

    String effectiveEvidenceType() {
        return evidenceType == null ? OwnedDocumentLookup.RENT_AGREEMENT : evidenceType;
    }

    void revoke(String why, UUID decider) {
        this.status = FlatmateVocabulary.STATUS_REJECTED;
        this.reason = why;
        this.decidedBy = decider;
    }

    void holdForReview(String why) {
        this.flagForReview = true;
        this.ownerConsent = false;
        this.status = FlatmateVocabulary.STATUS_PENDING;
        this.reason = why;
        this.decidedBy = null;
    }

    boolean badgeable() {
        return ownerConsent;
    }

    void expire(LocalDate on) {
        this.status = FlatmateVocabulary.STATUS_REJECTED;
        this.reason = "The agreement check behind your Verified property badge lapsed on " + on
                + ". Upload your current agreement to get the badge back.";
        this.decidedBy = null;
    }
}

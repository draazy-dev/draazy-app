package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.trust.OwnedDocumentLookup;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.verification.IdentityVerificationService;
import com.draazy.api.security.AuthPrincipal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Files evidence for the Verified property badge on a room or group already posted. Moderation status and every
 * other field stay put, so the badge request never re-publishes or re-moderates the ad. */
@Service
public class FlatmateBadgeRequestService {

    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateReviewRepository reviews;
    private final FlatmateReviewStatuses reviewStatuses;
    private final FlatmateOwnerConsentService consentService;
    private final FlatmatePublication publication;
    private final FlatmateMapper mapper;
    private final FlatmateRoomCards cards;
    private final OwnedDocumentLookup ownedDocuments;
    private final UserRepository users;
    private final IdentityVerificationService identity;

    FlatmateBadgeRequestService(FlatmateRoomRepository rooms, FlatmateGroupRepository groups,
            FlatmateReviewRepository reviews, FlatmateReviewStatuses reviewStatuses,
            FlatmateOwnerConsentService consentService, FlatmatePublication publication,
            FlatmateMapper mapper, FlatmateRoomCards cards, OwnedDocumentLookup ownedDocuments,
            UserRepository users, IdentityVerificationService identity) {
        this.identity = identity;
        this.rooms = rooms;
        this.groups = groups;
        this.reviews = reviews;
        this.reviewStatuses = reviewStatuses;
        this.consentService = consentService;
        this.publication = publication;
        this.mapper = mapper;
        this.cards = cards;
        this.ownedDocuments = ownedDocuments;
        this.users = users;
    }

    @Transactional
    public FlatmateRoomDto request(AuthPrincipal caller, UUID roomId, FlatmateBadgeRequest body) {
        FlatmateRoom room = rooms.lockLive(roomId)
                .filter(r -> r.getHostId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Room"));
        requireTenantHosted(room.getHostRole(), room.getVerificationTier());
        if (room.isSplitRoom()) {
            throw new ConflictException(FlatmateConflicts.SPLIT_ROOM,
                    "A split room is badged through its property, not a rent agreement.");
        }
        User me = requireIdentitySubmitted(caller);
        Evidence evidence = evidenceOf(caller, body);
        if (!unchanged(reviews.findByRoomId(room.getId()).orElse(null), evidence)) {
            consentService.settleRoomConsent(caller, room);
            room.setAgreementDeclared(true);
            room.setVerificationTier(FlatmateVocabulary.TIER_TENANT);
            room = rooms.saveAndFlush(room);
            file(caller, "room", room.getId(), null, address(room.getSociety(), room.getLocality()),
                    room.isFlagForReview(), room.isOwnerConsent(), evidence);
        }
        return mapper.toDto(room, cards.ownerViews(List.of(room), me.getName(), me.getMobile())
                .get(room.getId()));
    }

    @Transactional
    public FlatmateGroupDto requestForGroup(AuthPrincipal caller, UUID groupId,
            FlatmateBadgeRequest body) {
        FlatmateGroup group = groups.lockLive(groupId)
                .filter(g -> g.getHostId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Group"));
        if (group.isHunting()) {
            throw new ConflictException("hunting_group",
                    "A group still looking for a flat has no flat to verify.");
        }
        requireTenantHosted(group.getHostRole(), group.getVerificationTier());
        User me = requireIdentitySubmitted(caller);
        Evidence evidence = evidenceOf(caller, body);
        if (!unchanged(reviews.findByGroupId(group.getId()).orElse(null), evidence)) {
            group.setOwnerConsent(consentService.has(
                    group.getOwnerConsentMobile(), caller.userId(), group.getAddressFingerprint()));
            group.setAgreementDeclared(true);
            group.setVerificationTier(FlatmateVocabulary.TIER_TENANT);
            group = groups.saveAndFlush(group);
            file(caller, "group", null, group.getId(), address(null, group.getLocality()),
                    group.isFlagForReview(), group.isOwnerConsent(), evidence);
        }
        return mapper.toDto(group, new FlatmateMapper.PartyView(me.getName(), me.getMobile(),
                reviewStatuses.forGroups(List.of(group)).get(group.getId())));
    }

    private void file(AuthPrincipal caller, String kind, UUID roomId, UUID groupId, String address,
            boolean flagged, boolean ownerConsent, Evidence evidence) {
        var standing = roomId != null ? reviews.findByRoomId(roomId) : reviews.findByGroupId(groupId);
        publication.enqueueReviewIfNeeded(caller, kind, roomId, groupId, FlatmateVocabulary.TIER_TENANT,
                flagged, address, new FlatmatePublication.AgreementClaim(evidence.doc(),
                        new AgreementRegistration(), ownerConsent,
                        standing.map(FlatmateReview::getTenancyPropertyId).orElse(null), evidence.type()));
    }

    private User requireIdentitySubmitted(AuthPrincipal caller) {
        User me = users.findById(caller.userId()).orElseThrow(() -> NotFoundException.of("User"));
        if (!identity.isSubmitted(me.getId())) {
            throw new ConflictException(FlatmateConflicts.IDENTITY_REQUIRED,
                    "Submit your ID verification first, then request the Verified property badge.");
        }
        return me;
    }

    private Evidence evidenceOf(AuthPrincipal caller, FlatmateBadgeRequest body) {
        Object raw = body.agreementDoc().get("id");
        UUID documentId = Ids.parseUuid(raw == null ? null : raw.toString().strip()).orElseThrow(() ->
                new ValidationException("agreementDoc.id is required."));
        String type = ownedDocuments.flatEvidenceType(caller.userId(), documentId).orElseThrow(() ->
                new ValidationException("agreementDoc.id must reference a rent agreement or an electricity bill"
                        + " in your document vault."));
        AgreementPeriod period = OwnedDocumentLookup.RENT_AGREEMENT.equals(type)
                ? AgreementPeriod.of(body.agreementDoc(), FlatmateReviewChecks.today()) : null;
        return new Evidence(documentId, type, period);
    }

    private static boolean unchanged(FlatmateReview standing, Evidence evidence) {
        return standing != null && !FlatmateVocabulary.STATUS_REJECTED.equals(standing.getStatus())
                && evidence.doc().equals(standing.getAgreementDoc());
    }

    private static void requireTenantHosted(String hostRole, String tier) {
        if (!FlatmateVocabulary.ROLE_TENANT.equals(hostRole)
                || FlatmateVocabulary.TIER_OWNER.equals(tier)) {
            throw new ConflictException("not_tenant_hosted",
                    "Only a tenant-hosted post can request the Verified property badge.");
        }
    }

    private static String address(String society, String locality) {
        return society == null || society.isBlank() ? locality : society + ", " + locality;
    }

    private record Evidence(UUID id, String type, AgreementPeriod period) {

        Map<String, Object> doc() {
            Map<String, Object> doc = new LinkedHashMap<>();
            doc.put("id", id.toString());
            doc.put("type", type);
            if (period != null) {
                doc.put(AgreementPeriod.FROM, period.from().toString());
                doc.put(AgreementPeriod.TILL, period.till().toString());
            }
            return doc;
        }
    }
}
package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.listing.ListingPhotoSources;
import com.draazy.api.catalog.locality.LocalityBinding;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.catalog.society.SocietyReference;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.persistence.ConstraintViolations;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.OwnedDocumentLookup;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.verification.IdentityVerificationService;
import com.draazy.api.security.AuthPrincipal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateSupplyService {

    private static final Logger log = LoggerFactory.getLogger(FlatmateSupplyService.class);

    private static final int MAX_INTERESTS = 10;

    private static final Duration RATE_WINDOW = Duration.ofHours(1);

    private static final int MAX_MESSAGE = 4000;

    private static final String ONE_PER_TARGET_INDEX = "uq_flatmate_requests_target_requester";

    static final int MAX_PER_ROOM = 3;

    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateRequestRepository requests;

    /** Owner-consent fact keyed by (owner mobile, tenant) — outlives any one group. */
    private final FlatmateOwnerConsentService consentService;
    private final FlatmateGuardrails guardrails;

    private final FlatmatePublication publication;
    private final FlatmateMapper mapper;

    private final FlatmateRoomCards cards;
    private final PropertyRepository properties;

    private final SocietyReference societyReference;
    private final UserRepository users;
    private final Notifier notifier;

    private final RateLimitLock locks;

    private final FlatmateReviewStatuses reviewStatuses;

    /** Which edits earn a moderator's attention — asked before the mapper overwrites the answer. */
    private final FlatmateEditRules editRules;
    private final OwnedDocumentLookup ownedDocuments;
    private final FlatmateMembershipService membership;
    private final LocalityBinding localities;
    private final ListingPhotoSources photoSources;
    private final FlatmateGenderGate genderGate;
    private final FlatmateInterestLedger ledger;
    private final FlatmateOwnerNoticeService ownerNotice;
    private final IdentityVerificationService identity;

    public FlatmateSupplyService(FlatmateRoomRepository rooms, FlatmateGroupRepository groups,
            FlatmateRequestRepository requests,
            FlatmateGuardrails guardrails,
            FlatmateOwnerConsentService consentService,
            FlatmatePublication publication,
            FlatmateMapper mapper, PropertyRepository properties, UserRepository users,
            Notifier notifier,
            RateLimitLock locks, FlatmateRoomCards cards, SocietyReference societyReference,
            FlatmateReviewStatuses reviewStatuses, FlatmateEditRules editRules,
            OwnedDocumentLookup ownedDocuments, FlatmateMembershipService membership,
            LocalityBinding localities, ListingPhotoSources photoSources, FlatmateGenderGate genderGate,
            FlatmateInterestLedger ledger, FlatmateOwnerNoticeService ownerNotice,
            IdentityVerificationService identity) {
        this.identity = identity;
        this.ownerNotice = ownerNotice;
        this.genderGate = genderGate;
        this.ledger = ledger;
        this.rooms = rooms;
        this.groups = groups;
        this.requests = requests;
        this.consentService = consentService;
        this.guardrails = guardrails;
        this.publication = publication;
        this.mapper = mapper;
        this.properties = properties;
        this.users = users;
        this.notifier = notifier;
        this.locks = locks;
        this.cards = cards;
        this.societyReference = societyReference;
        this.reviewStatuses = reviewStatuses;
        this.editRules = editRules;
        this.ownedDocuments = ownedDocuments;
        this.membership = membership;
        this.localities = localities;
        this.photoSources = photoSources;
    }

    @Transactional
    public FlatmateRoomDto createRoom(AuthPrincipal caller, FlatmateRoomCreateRequest body) {
        photoSources.requireUploaded(body.photos(), List.of(), List.of(caller.userId()));
        NewRoomRequirements.check(body);
        String hostRole = FlatmateVocabulary.orDefault(
                body.hostRole(), FlatmateVocabulary.HOST_ROLE, "tenant", "host role");
        boolean declared = declaresAgreement(caller.userId(), body.agreementDeclared(), body.agreementDoc());
        UUID claimedFlat = Ids.parseUuid(body.propertyId()).orElse(null);

        String tier = deriveTier(caller, hostRole, claimedFlat, declared);
        requireTenantOwnerConsent(caller, hostRole, tier, body);
        String societyName = societyReference.nameOf(body.societyId());
        String locality = localities.canonicalName(body.localitySlug(), body.locality());
        var address = new FlatmateGuardrails.Address(
                ownedFlat(tier, claimedFlat), societyName, locality, null);
        var eligibility = guardrails.evaluate(caller.userId(), tier, address);
        if (eligibility.blocked()) {
            throw new HostBlockedException(eligibility);
        }

        FlatmateRoom room = new FlatmateRoom(
                caller.userId(),
                FlatmateVocabulary.require(body.roomType(), FlatmateVocabulary.ROOM_TYPE, "room type"),
                locality,
                body.rentShare());

        // nameOf above refused a bad id before the mapper could turn it into null and file the room
        // attached to nothing. See SocietyReference.
        mapper.applyTo(body, room);
        room.setLocalities(List.of(locality));
        room.setSociety(societyName);

        // Everything the client is not. These four are the trust decision, kept here rather than in
        // the mapper so they stay reviewable as a block (api-standards 8.1).
        room.setHostRole(hostRole);
        room.setAgreementDeclared(declared);
        room.setAddressFingerprint(eligibility.fingerprint());
        room.setFlagForReview(eligibility.flagForReview());
        room.setVerificationTier(tier);

        // Consent is the consent table's answer, never the client's. See settleRoomConsent.
        consentService.settleRoomConsent(caller, room);

        room.setModStatus(publication.stateFor(tier, eligibility.flagForReview() || room.getPhotos().isEmpty(), false));
        applyRoomPlaces(room);
        applyOccupancy(body, room);

        FlatmateRoom saved = rooms.saveAndFlush(room);
        ownerNotice.noticeIfNeeded(saved);
        publication.enqueueReviewIfNeeded(caller, "room", saved.getId(), null, tier,
                eligibility.flagForReview(),
                addressLabel(saved.getSociety(), saved.getLocality()),
                claimOf(caller, body, saved.isOwnerConsent()));
        return mapper.toDto(saved, ownView(caller, saved, saved.getOccupants()));
    }

    /** Tier is preserved: the flat did not stop being the flat because somebody moved out. */
    @Transactional
    public FlatmateRoomDto setSeats(AuthPrincipal caller, UUID roomId, int seatsOpen) {
        FlatmateRoom room = ownedRoom(caller, roomId);
        if (!room.isSeatBased()) {
            throw new ConflictException(
                    "This room tracks occupants rather than seats — record how many people live "
                            + "there instead. (not_seat_based)");
        }
        if (seatsOpen < 0 || seatsOpen > room.getSeatsTotal()) {
            throw new BadRequestException(
                    "Seats open must be between 0 and " + room.getSeatsTotal() + ".");
        }
        room.setSeatsOpen(seatsOpen);
        FlatmateRoom saved = rooms.saveAndFlush(room);
        return mapper.toDto(saved, ownView(caller, saved, committedInFlat(saved)));
    }

    /** Clamped to {@code min(3, maxOccupants - siblings)} so a host cannot exceed the flat cap
     * room-by-room. */
    @Transactional
    public FlatmateRoomDto setOccupants(AuthPrincipal caller, UUID roomId, int occupants) {
        rooms.findPropertyId(roomId).ifPresent(rooms::lockFlat);
        FlatmateRoom room = ownedRoom(caller, roomId);

        // A room keeps one ledger or the other: an occupant count on a seat-model room writes a
        // figure the feed ignores, so the host's edit succeeds and nothing changes.
        if (!room.isSplitRoom()) {
            throw new ForbiddenException(
                    "Only rooms created by splitting a flat track occupants.");
        }
        if (occupants < 0) {
            throw new BadRequestException("Occupants cannot be negative.");
        }
        int siblings = committedInFlat(room) - room.getOccupants();
        int ceiling = Math.max(0, Math.min(MAX_PER_ROOM, room.getMaxOccupants() - siblings));
        room.setOccupants(Math.min(occupants, ceiling));
        FlatmateRoom saved = rooms.saveAndFlush(room);
        return mapper.toDto(saved, ownView(caller, saved, committedInFlat(saved)));
    }

    @Transactional
    public void roomInterest(AuthPrincipal caller, UUID roomId, String share, String message,
            String gender) {
        FlatmateRoom room = rooms.findVisible(roomId)
                .orElseThrow(() -> NotFoundException.of("Room"));
        if (room.getHostId().equals(caller.userId())) {
            throw new ForbiddenException("You cannot enquire about your own room.");
        }
        genderGate.admitToRoom(caller.userId(), room.getGender(), gender);
        String intent = FlatmateVocabulary.orDefault(
                share, FlatmateVocabulary.SHARE_INTENT, "solo", "share intent");
        if (noSpaceFor(room, "bring".equals(intent) ? 2 : 1)) {
            throw FlatmateConflicts.roomFull("This room is full right now.");
        }
        record(caller, "room", room.getId(), room.getHostId(), intent,
                roomPitch(message, intent), "your room in " + room.getLocality());
    }

    private boolean noSpaceFor(FlatmateRoom room, int people) {
        if (room.isSplitRoom()) {
            int siblings = committedInFlat(room) - room.getOccupants();
            return room.getOccupants() + people > Math.min(MAX_PER_ROOM, room.getMaxOccupants() - siblings);
        }
        return room.isSeatBased() && (room.getSeatsOpen() == null || room.getSeatsOpen() <= 0);
    }

    @Transactional
    public FlatmateGroupDto createGroup(AuthPrincipal caller, FlatmateGroupCreateRequest body) {
        User host = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));
        String hostName = FlatmateVocabulary.profileName(host);
        FlatmateGroupClaim claim = FlatmateGroupClaim.of(body,
                () -> declaresAgreement(caller.userId(), body.agreement(), body.agreementDoc()),
                localities::canonicalNames, localities::canonicalName);
        String hostRole = claim.hostRole();
        boolean declared = claim.declared();
        UUID propertyId = claim.propertyId();

        String tier = deriveTier(caller, hostRole, propertyId, declared);
        String locality = claim.locality();

        var address = new FlatmateGuardrails.Address(
                FlatmateVocabulary.TIER_OWNER.equals(tier) ? propertyId : null,
                null, locality, body.title());
        var eligibility = guardrails.evaluate(caller.userId(), tier, address);
        if (eligibility.blocked()) {
            throw new HostBlockedException(eligibility);
        }

        FlatmateGroup group = new FlatmateGroup(
                caller.userId(), body.title().strip(), locality, claim.rent());
        mapper.applyTo(body, group);
        claim.shape(group);
        rejectMoreOpenSeatsThanSeats(group);

        group.setHostRole(hostRole);
        group.setVerificationTier(tier);
        group.setAgreementDeclared(declared);
        group.setAddressFingerprint(eligibility.fingerprint());

        // Consent flag decided here by asking the consent table; client cannot set it. Set after
        // the fingerprint because the question asked is about this flat, not about this owner.
        group.setOwnerConsent(consentService.has(
                group.getOwnerConsentMobile(), caller.userId(), group.getAddressFingerprint()));
        group.setFlagForReview(eligibility.flagForReview());
        String state = publication.stateFor(tier, eligibility.flagForReview(), group.isHunting());
        group.setModStatus(state);
        FlatmatePublication.queueUnreviewed(group.getRecheck(), state, group.isHunting());

        // Only honoured when the tier actually came out as owner — see deriveTier.
        group.setPropertyId(FlatmateVocabulary.TIER_OWNER.equals(tier) ? propertyId : null);

        group.addMember(new FlatmateGroupMember(hostName, caller.userId(), caller.verified()));
        clampOpenSeats(group);

        FlatmateGroup saved = groups.saveAndFlush(group);
        publication.enqueueReviewIfNeeded(caller, "group", null, saved.getId(), tier,
                eligibility.flagForReview(),
                addressLabel(null, saved.getLocality()),
                claimOf(caller, body, saved.isOwnerConsent()));
        return mapper.toDto(saved, ownParty(caller));
    }

    /** Full body (same shape as POST) so "absent" and "cleared" stay distinguishable. Split rooms
     * are refused — the address belongs to the flat. */
    @Transactional
    public FlatmateRoomDto updateRoom(AuthPrincipal caller, UUID roomId,
            FlatmateRoomCreateRequest body) {
        FlatmateRoom room = ownedRoom(caller, roomId);
        if (room.isSplitRoom()) {
            throw new ConflictException(FlatmateConflicts.mark(
                    "This room came from splitting a flat, so its address is the flat's. "
                            + "Edit the property instead.",
                    FlatmateConflicts.SPLIT_ROOM));
        }
        photoSources.requireUploaded(body.photos(), room.getPhotos(), List.of(caller.userId()));

        String hostRole = FlatmateVocabulary.orDefault(
                body.hostRole(), FlatmateVocabulary.HOST_ROLE, "tenant", "host role");
        boolean declared = declaresAgreement(caller.userId(), body.agreementDeclared(), body.agreementDoc());
        UUID claimedFlat = Ids.parseUuid(body.propertyId()).orElse(null);
        String tier = deriveTier(caller, hostRole, claimedFlat, declared);
        requireTenantOwnerConsent(caller, hostRole, tier, body);

        SocietyReference.Binding society = societyReference.rebind(
                room.getSocietyId(), room.getSociety(), body.societyId());
        String societyName = society.name();
        String locality = localities.canonicalName(body.localitySlug(), body.locality().strip(), List.of(room.getLocality()));

        // Before applyTo, which is the only moment the stored values still exist to compare against.
        FlatmateEditImpact impact = editRules.classify(room, body);
        mapper.applyTo(body, room);
        room.setSocietyId(society.id());
        room.setSociety(societyName);

        // Constructor invariants, editable here because a wrong locality is the commonest fix.
        room.setRoomType(FlatmateVocabulary.require(
                body.roomType(), FlatmateVocabulary.ROOM_TYPE, "room type"));
        room.setLocality(locality);
        room.setLocalities(List.of(locality));

        room.setBudget(body.rentShare());
        applyRoomPlaces(room);

        publication.reapplyAfterEdit(caller, tier, impact, room,
                new FlatmateGuardrails.Address(ownedFlat(tier, claimedFlat), societyName,
                        locality, null));
        room.setHostRole(hostRole);
        room.setAgreementDeclared(declared);
        room.setVerificationTier(tier);
        consentService.settleRoomConsent(caller, room);
        applyOccupancy(body, room);

        FlatmateRoom saved = rooms.saveAndFlush(room);
        ownerNotice.noticeIfNeeded(saved);
        publication.enqueueReviewIfNeeded(caller, "room", saved.getId(), null, tier,
                saved.isFlagForReview(),
                addressLabel(saved.getSociety(), saved.getLocality()),
                claimOf(caller, body, saved.isOwnerConsent()));
        return mapper.toDto(saved, ownView(caller, saved, saved.getOccupants()));
    }

    private static void applyRoomPlaces(FlatmateRoom room) {
        int places = FlatmateVocabulary.ROOM_DOUBLE.equals(room.getRoomType()) ? 2 : 1;
        Integer total = room.getSeatsTotal();
        int taken = total == null || room.getSeatsOpen() == null ? 0 : total - room.getSeatsOpen();
        room.setSeatsTotal(places);
        room.setSeatsOpen(Math.max(0, places - taken));
        room.setPriceBasis("room");
    }

    private static void applyOccupancy(FlatmateRoomCreateRequest body, FlatmateRoom room) {
        if (body.maxOccupants() != null) {
            room.setMaxOccupants(body.maxOccupants());
        }
        if (body.occupants() != null) {
            room.setOccupants(room.isSplitRoom()
                    ? Math.min(body.occupants(), Math.min(MAX_PER_ROOM, room.getMaxOccupants()))
                    : body.occupants());
        }
    }

    /** {@code seatsTotal} can move here only, and never below the members already in the group —
     * that would be an eviction, which no route means. */
    @Transactional
    public FlatmateGroupDto updateGroup(AuthPrincipal caller, UUID groupId,
            FlatmateGroupCreateRequest body) {
        FlatmateGroup group = ownedGroup(caller, groupId);

        FlatmateGroupClaim claim = FlatmateGroupClaim.of(body,
                () -> declaresAgreement(caller.userId(), body.agreement(), body.agreementDoc()),
                names -> localities.canonicalNames(names, group.getLocalities()),
                (slug, name) -> localities.canonicalName(slug, name, group.getLocalities()));
        String hostRole = claim.hostRole();
        boolean declared = claim.declared();
        UUID propertyId = claim.propertyId();
        String tier = deriveTier(caller, hostRole, propertyId, declared);
        String locality = claim.locality();

        FlatmateEditImpact impact = editRules.classify(group, body, locality,
                mapper.seatsOrTwo(body.seats()));
        mapper.applyTo(body, group);
        group.setTitle(body.title().strip());
        claim.shape(group);

        int taken = group.getMembers().size();
        if (group.getSeatsTotal() < taken) {
            throw new BadRequestException("This group already has " + taken
                    + " members, so it cannot be resized below that.");
        }
        rejectMoreOpenSeatsThanSeats(group);
        clampOpenSeats(group);

        publication.reapplyAfterEdit(caller, tier, impact, group,
                new FlatmateGuardrails.Address(
                        FlatmateVocabulary.TIER_OWNER.equals(tier) ? propertyId : null,
                        null, locality, body.title()));
        group.setHostRole(hostRole);
        group.setAgreementDeclared(declared);
        group.setVerificationTier(tier);
        group.setPropertyId(FlatmateVocabulary.TIER_OWNER.equals(tier) ? propertyId : null);

        /** Re-derived, exactly as createGroup does it, because the mapper has just overwritten the
         * number this flag is about — otherwise a standing `true` rides on against a new number. */
        group.setOwnerConsent(consentService.has(
                group.getOwnerConsentMobile(), caller.userId(), group.getAddressFingerprint()));

        FlatmateGroup saved = groups.saveAndFlush(group);
        publication.enqueueReviewIfNeeded(caller, "group", null, saved.getId(), tier,
                saved.isFlagForReview(),
                addressLabel(null, saved.getLocality()),
                claimOf(caller, body, saved.isOwnerConsent()));
        return mapper.toDto(saved, ownParty(caller));
    }

    /** A null {@code seatsOpen} is not a zero — it means the form did not ask, and unboxing it
     * would throw an NPE out of every create that leaves the field out. */
    private static void rejectMoreOpenSeatsThanSeats(FlatmateGroup group) {
        Integer open = group.getSeatsOpen();
        if (open != null && open > group.getSeatsTotal()) {
            throw new BadRequestException("A group cannot have more seats open than it has seats.");
        }
    }

    private static void clampOpenSeats(FlatmateGroup group) {
        if (group.getSeatsOpen() != null) {
            group.setSeatsOpen(group.openSeats());
        }
    }

    @Transactional
    public void deleteGroup(AuthPrincipal caller, UUID groupId) {
        FlatmateGroup group = ownedGroup(caller, groupId);
        group.archive("removed by the host");
        groups.saveAndFlush(group);
        membership.disband(group);
    }

    @Transactional
    public FlatmateGroupDto setGroupSeats(AuthPrincipal caller, UUID groupId, int seatsOpen) {
        FlatmateGroup group = ownedGroup(caller, groupId);
        int taken = group.getSeatsTotal() - group.openSeats();
        int max = FlatmateGroup.MAX_SEATS - taken;
        if (seatsOpen < 0 || seatsOpen > max) {
            throw new BadRequestException("Seats open must be between 0 and " + max
                    + " — a group shares between at most " + FlatmateGroup.MAX_SEATS + " people.");
        }
        if (taken + seatsOpen != group.getSeatsTotal()) {
            group.setSeatsTotal(taken + seatsOpen);
            group.getRecheck().settle(group.getModStatus(), List.of("seats"));
        }
        group.setSeatsOpen(seatsOpen);
        return mapper.toDto(groups.saveAndFlush(group), ownParty(caller));
    }

    /** Always a pending request, whatever the group's gender policy: nobody joins until the host
     * has vetted them and accepted. */
    @Transactional
    public FlatmateRequestDto join(AuthPrincipal caller, UUID groupId, String share, String message,
            String gender) {
        FlatmateGroup group = groups.lockVisible(groupId)
                .orElseThrow(() -> NotFoundException.of("Group"));
        if (group.getHostId().equals(caller.userId())) {
            throw new ForbiddenException("You cannot ask to join your own group.");
        }
        genderGate.admitToGroup(caller.userId(), group.getPolicy(), gender);

        if (group.openSeats() <= 0) {
            throw FlatmateConflicts.groupFull("This group is full.");
        }
        String intent = FlatmateVocabulary.orDefault(
                share, FlatmateVocabulary.SHARE_INTENT, "solo", "share intent");

        FlatmateRequest saved = record(caller, "group", group.getId(), group.getHostId(), intent,
                FlatmateVocabulary.blankToNull(message) == null
                        ? "Hi! I'd like to join this group." : message.strip(),
                group.getTitle());

        User requester = users.findById(caller.userId()).orElse(null);
        return FlatmateRequestDto.of(saved, group.getTitle(), group.getLocality(),
                requester == null ? null : requester.getName(),
                requester == null ? null : requester.getMobile());
    }

    /** The one place a verification tier is decided: owner requires the caller's own approved listing that carries the
     * Verified property badge, tenant is a claim, identity is the floor. */
    private String deriveTier(AuthPrincipal caller, String hostRole, UUID propertyId,
            boolean agreementDeclared) {
        if (FlatmateVocabulary.ROLE_OWNER.equals(hostRole) && propertyId != null) {
            Optional<Property> parent = properties.findById(propertyId);
            boolean ownsBadgedListing = parent
                    .filter(p -> p.getOwner() != null
                            && p.getOwner().getId().equals(caller.userId()))
                    .filter(p -> PropertyStatus.APPROVED.equals(p.getStatus()) && !p.isArchived())
                    .filter(Property::isOwnershipVerified)
                    .isPresent();
            if (ownsBadgedListing) {
                return FlatmateVocabulary.TIER_OWNER;
            }
        }
        return agreementDeclared ? FlatmateVocabulary.TIER_TENANT : FlatmateVocabulary.TIER_IDENTITY;
    }

    private boolean declaresAgreement(UUID hostId, Boolean requested, Map<String, Object> document) {
        if (!Boolean.TRUE.equals(requested)) {
            return false;
        }
        if (document == null || document.isEmpty()) {
            throw new ValidationException("A declared agreement needs the agreement document.");
        }
        String documentId = agreementDocId(document);
        if (documentId == null) {
            throw new ValidationException("A declared agreement needs the agreement document id.");
        }
        if (!ownedAgreementDocument(hostId, documentId)) {
            throw new ValidationException(
                    "agreementDoc.id must reference an uploaded agreement document you own.");
        }
        if (!identity.isSubmitted(hostId)) {
            throw new ConflictException(FlatmateConflicts.IDENTITY_REQUIRED,
                    "Submit your ID verification first, then attach the agreement for the Verified property badge.");
        }
        return true;
    }

    private void requireTenantOwnerConsent(AuthPrincipal caller, String hostRole, String tier,
            FlatmateRoomCreateRequest body) {
        if (!FlatmateVocabulary.ROLE_TENANT.equals(FlatmateVocabulary.blankToNull(hostRole))
                || FlatmateVocabulary.TIER_OWNER.equals(tier)) {
            return;
        }
        if (!Boolean.TRUE.equals(body.ownerConsent())) {
            throw new ValidationException(
                    "ownerConsent must be true for a tenant-hosted flatmate room.");
        }
        if (FlatmateVocabulary.blankToNull(body.ownerConsentMobile()) == null) {
            throw new ValidationException(
                    "ownerConsentMobile is required for a tenant-hosted flatmate room.");
        }
        consentService.normalise(caller, body.ownerConsentMobile());
    }

    private boolean ownedAgreementDocument(UUID hostId, String documentId) {
        return Ids.parseUuid(documentId)
                .map(id -> ownedDocuments.ownsDocument(hostId, id))
                .orElse(false);
    }

    private static String agreementDocId(Map<String, Object> document) {
        if (document == null) {
            return null;
        }
        Object value = document.get("id");
        if (value == null) {
            value = document.get("documentId");
        }
        String text = value == null ? null : value.toString().strip();
        return text == null || text.isBlank() ? null : text;
    }

    /** Gated on the tier rather than the request, so a stranger cannot reserve somebody else's flat
     * by guessing its id. A spare room never stores the id — the schema forbids seats on a split row. */
    private static UUID ownedFlat(String tier, UUID propertyId) {
        return FlatmateVocabulary.TIER_OWNER.equals(tier) ? propertyId : null;
    }

    /** {@code ownerConsent} comes from the saved row, never the request, so the value filed with Ops
     * is the one {@link FlatmateOwnerConsentService#settleRoomConsent} derived. */
    private FlatmatePublication.AgreementClaim claimOf(AuthPrincipal caller,
            FlatmateRoomCreateRequest body, boolean ownerConsent) {
        return new FlatmatePublication.AgreementClaim(body.agreementDoc(),
                new AgreementRegistration(), ownerConsent,
                Ids.parseUuid(body.propertyId()).orElse(null),
                evidenceTypeOf(caller.userId(), body.agreementDoc()));
    }

    private FlatmatePublication.AgreementClaim claimOf(AuthPrincipal caller,
            FlatmateGroupCreateRequest body, boolean ownerConsent) {
        if (body.hunting()) {
            return new FlatmatePublication.AgreementClaim(null,
                    new AgreementRegistration(), false, null, null);
        }
        return new FlatmatePublication.AgreementClaim(body.agreementDoc(),
                new AgreementRegistration(), ownerConsent,
                Ids.parseUuid(body.propertyId()).orElse(null),
                evidenceTypeOf(caller.userId(), body.agreementDoc()));
    }

    private String evidenceTypeOf(UUID hostId, Map<String, Object> document) {
        return Ids.parseUuid(agreementDocId(document))
                .flatMap(id -> ownedDocuments.flatEvidenceType(hostId, id)).orElse(null);
    }

    private FlatmateRequest record(AuthPrincipal caller, String kind, UUID targetId, UUID hostId,
            String intent, String message, String targetLabel) {
        String body = message == null || message.length() <= MAX_MESSAGE
                ? message : message.substring(0, MAX_MESSAGE);

        locks.holdUntilCommit(RateLimitLock.Limit.FLATMATE_INTEREST, caller.userId().toString());

        // Existence check AFTER the lock: under READ COMMITTED the double-press loser sees the row.
        // Ahead of rate-limit on purpose — a repeat ask is not a delivery.
        if (requests.findByKindAndTargetIdAndRequesterId(kind, targetId, caller.userId())
                .isPresent()) {
            throw alreadyInterested();
        }
        if ("group".equals(kind)) {
            membership.requireRoomToAsk(caller.userId());
        }
        ledger.requireNotRecentlyWithdrawn(kind, targetId, caller.userId());

        if (ledger.sentSince(caller.userId(), Instant.now().minus(RATE_WINDOW)) >= MAX_INTERESTS) {
            throw new RateLimitedException(
                    "You have contacted a lot of hosts in the last hour. Try again shortly.",
                    (int) RATE_WINDOW.toSeconds());
        }

        FlatmateRequest saved;
        try {
            saved = requests.saveAndFlush(new FlatmateRequest(
                    kind, targetId, hostId, caller.userId(), intent, body));
        } catch (DataIntegrityViolationException raced) {

            // V27's unique index is the backstop for repeatable-read sessions; only that index is translated to 409 —
            // other integrity violations propagate untranslated.
            if (!isDuplicateInterest(raced)) {
                throw raced;
            }

            // Reaching this line means the re-read did not do its job; caller sees the same 409.
            log.debug("duplicate flatmate interest reached the index: kind={} target={} requester={}",
                    kind, targetId, caller.userId());
            throw alreadyInterested();
        }

        User requester = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));

        // `users.name` is nullable (OTP sign-in with no profile); "Someone" beats concatenating null.
        String requesterName = FlatmateVocabulary.blankToNull(requester.getName());
        notifier.notify(
                hostId,
                "flatmate." + kind + ".interest",
                (requesterName == null ? "Someone" : requesterName) + " is interested in " + targetLabel,
                "Open your request inbox to review their interest.",
                FlatmateLinks.of(kind, targetId));
        return saved;
    }

    private static boolean isDuplicateInterest(DataIntegrityViolationException violation) {
        return ConstraintViolations.isOn(violation, ONE_PER_TARGET_INDEX);
    }

    /** {@link FlatmateConflicts} appends the marker after the message, so nothing follows it by
     * accident. */
    private static ConflictException alreadyInterested() {
        return FlatmateConflicts.alreadyInterested(
                "You have already sent this host a request — your earlier message is with them.");
    }

    private int committedInFlat(FlatmateRoom room) {
        if (!room.isSplitRoom()) {
            return room.getOccupants();
        }
        return rooms.findByPropertyIdAndArchivedFalse(room.getPropertyId()).stream()
                .mapToInt(FlatmateRoom::getOccupants)
                .sum();
    }

    /** Locked, so the host's write and a staff verdict or a seat-taking acceptance cannot interleave;
     * a stranger's id is a 404 so ids do not become an existence oracle. */
    private FlatmateRoom ownedRoom(AuthPrincipal caller, UUID roomId) {
        return rooms.lockLive(roomId)
                .filter(r -> r.getHostId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Room"));
    }

    private FlatmateGroup ownedGroup(AuthPrincipal caller, UUID groupId) {
        return groups.lockLive(groupId)
                .filter(g -> g.getHostId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Group"));
    }

    private String hostName(UUID hostId) {
        return users.findById(hostId).map(User::getName).orElse(null);
    }

    /** Carries the Ops verdict because the badge is derived from it: a response omitting it would
     * answer {@code verified: false} for a room the feed badges. */
    private FlatmateMapper.RoomView ownView(AuthPrincipal caller, FlatmateRoom room, int flatCommitted) {
        return new FlatmateMapper.RoomView(flatCommitted, hostName(caller.userId()),
                callerMobile(caller), reviewStatuses.forRooms(List.of(room)).get(room.getId()));
    }

    private FlatmateMapper.PartyView ownParty(AuthPrincipal caller) {
        return new FlatmateMapper.PartyView(hostName(caller.userId()), callerMobile(caller));
    }

    private String callerMobile(AuthPrincipal caller) {
        return users.findById(caller.userId()).map(User::getMobile).orElse(null);
    }

    private static String addressLabel(String society, String locality) {
        return society == null || society.isBlank() ? locality : society + ", " + locality;
    }

    private static String roomPitch(String message, String intent) {
        String supplied = FlatmateVocabulary.blankToNull(message);
        if (supplied != null) {
            return supplied;
        }
        return switch (intent) {
            case "bring" -> "Hi! There are two of us — could we take this room together?";
            case "match" -> "Hi! I'd take this room and am happy to share it with someone.";
            default -> "Hi! Is this room still available?";
        };
    }

    /** Carries the eligibility result so the client can explain the refusal; the contract declares
     * {@code HostEligibility} as the 409 body for both creates. */
    public static class HostBlockedException extends ConflictException {

        private final transient FlatmateGuardrails.HostEligibility eligibility;

        HostBlockedException(FlatmateGuardrails.HostEligibility eligibility) {
            super(FlatmateConflicts.mark(eligibility.reason(),
                    FlatmateConflicts.guardrailSubCode(eligibility.overCap(),
                            eligibility.duplicate())));
            this.eligibility = eligibility;
        }

        public FlatmateGuardrails.HostEligibility eligibility() {
            return eligibility;
        }
    }
}

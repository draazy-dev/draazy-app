package com.draazy.api.engagement.flatmate;

import com.draazy.api.catalog.property.DealIntent;
import com.draazy.api.catalog.property.OwnershipVerified;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyPublished;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.catalog.society.Society;
import com.draazy.api.catalog.society.SocietyRepository;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatSplitService {
    private static final int MAX_PER_ROOM = 3;

    private static final int HALL = 1;

    private final PropertyRepository properties;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGuardrails guardrails;
    private final FlatmateMapper mapper;
    private final UserRepository users;
    private final SocietyRepository societies;
    private final RateLimitLock locks;

    public FlatSplitService(PropertyRepository properties, FlatmateRoomRepository rooms,
            FlatmateGuardrails guardrails, FlatmateMapper mapper, UserRepository users, SocietyRepository societies,
            RateLimitLock locks) {
        this.properties = properties;
        this.rooms = rooms;
        this.guardrails = guardrails;
        this.mapper = mapper;
        this.users = users;
        this.societies = societies;
        this.locks = locks;
    }

    private Property ownedBy(AuthPrincipal caller, UUID propertyId) {
        Property parent = properties.findById(propertyId)
                .filter(p -> !p.isArchived() && p.getOwner() != null && p.getOwner().getId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Property"));
        locks.holdUntilCommit(RateLimitLock.Limit.FLATMATE_LISTING_DECISION, propertyId.toString());
        return parent;
    }

    @Transactional
    public FlatSplitResult split(AuthPrincipal caller, UUID propertyId, FlatSplitRequest body) {
        Property parent = ownedBy(caller, propertyId);
        if (!DealIntent.RENT.equals(parent.getDeal())) {
            throw new ConflictException(
                    "Only a rent listing can be let room by room. (not_splittable)");
        }
        if (!rooms.findByPropertyIdAndArchivedFalse(propertyId).isEmpty()) {
            throw new ConflictException(
                    "This flat is already let room by room. (already_split)");
        }

        List<FlatSplitRequest.RoomSpec> specs = body.rooms();
        validateRoomCount(parent, specs.size());
        validateOccupancy(body.maxOccupants(), specs.size());

        boolean badged = standsAsOwnerTier(parent);
        String tier = badged ? FlatmateVocabulary.TIER_OWNER : FlatmateVocabulary.TIER_IDENTITY;
        var address = new FlatmateGuardrails.Address(propertyId, null, parent.getLocality(), null);
        var eligibility = guardrails.evaluate(caller.userId(), tier, address);
        if (eligibility.blocked()) {
            throw new FlatmateSupplyService.HostBlockedException(eligibility);
        }

        User owner = users.findById(caller.userId())
                .orElseThrow(() -> NotFoundException.of("User"));

        List<FlatmateRoomDto> created = new ArrayList<>();
        for (FlatSplitRequest.RoomSpec spec : specs) {
            FlatmateRoom room = buildRoom(caller, parent, spec, body.maxOccupants(), tier,
                    eligibility.fingerprint(), eligibility.flagForReview());
            created.add(mapper.toDto(rooms.saveAndFlush(room), new FlatmateMapper.RoomView(

                    0, owner.getName(), owner.getMobile(), null)));
        }

        return new FlatSplitResult(created.size(), tier, !badged, eligibility.flagForReview(),
                created);
    }

    @EventListener
    public void promoteOnApproval(PropertyPublished event) {
        promoteIfStanding(event.propertyId());
    }

    @EventListener
    public void promoteOnOwnershipVerified(OwnershipVerified event) {
        promoteIfStanding(event.propertyId());
    }

    private void promoteIfStanding(UUID propertyId) {
        if (propertyId == null
                || properties.findById(propertyId).filter(FlatSplitService::standsAsOwnerTier).isEmpty()) {
            return;
        }
        rooms.findByPropertyIdAndArchivedFalse(propertyId).stream()
                .filter(room -> FlatmateVocabulary.TIER_IDENTITY.equals(room.getVerificationTier()))
                .forEach(room -> {
                    room.setVerificationTier(FlatmateVocabulary.TIER_OWNER);
                    rooms.save(room);
                });
    }

    private static boolean standsAsOwnerTier(Property property) {
        return PropertyStatus.APPROVED.equals(property.getStatus()) && !property.isArchived()
                && property.isOwnershipVerified();
    }

    @Transactional
    public void unsplit(AuthPrincipal caller, UUID propertyId) {
        Property parent = ownedBy(caller, propertyId);

        List<FlatmateRoom> siblings = rooms.lockFlat(propertyId);
        if (siblings.isEmpty()) {
            throw NotFoundException.of("Split");
        }
        if (siblings.stream().anyMatch(r -> r.getOccupants() > 0)) {
            throw new ConflictException(
                    "Someone has already moved in, so this flat cannot stop being let room by "
                            + "room. (occupied)");
        }

        siblings.forEach(room -> {
            room.archive("split withdrawn by the owner");
            rooms.saveAndFlush(room);
        });
    }

    private FlatmateRoom buildRoom(AuthPrincipal caller, Property parent,
            FlatSplitRequest.RoomSpec spec, int maxOccupants, String tier,
            String fingerprint, boolean flagged) {
        String kind = FlatmateVocabulary.require(
                spec.roomKind(), FlatmateVocabulary.ROOM_KIND, "room kind");

        FlatmateRoom room = new FlatmateRoom(
                caller.userId(), "Private room", parent.getLocality(), spec.rent());
        room.setPropertyId(parent.getId());
        room.setRoomKind(kind);

        room.setAttachedBath("master".equals(kind) ? "attached" : "shared");

        room.setPriceBasis("room");
        room.setDeposit(spec.deposit() == null ? spec.rent() * 2 : spec.deposit());
        room.setMaxOccupants(maxOccupants);
        room.setOccupants(0);

        room.setSeatsTotal(null);
        room.setSeatsOpen(null);
        room.setHostRole(FlatmateVocabulary.ROLE_OWNER);
        room.setVerificationTier(tier);
        room.setSocietyId(parent.getSocietyId());
        room.setSociety(parent.getSocietyId() == null ? null
                : societies.findById(parent.getSocietyId()).map(Society::getName).orElse(null));
        room.setLocalities(List.of(parent.getLocality()));
        room.setLat(parent.getLat());
        room.setLng(parent.getLng());
        room.setBhk(bhkLabel(parent.getBhk()));
        room.setNote(FlatmateVocabulary.blankToNull(spec.note()));
        room.setAddressFingerprint(fingerprint);
        room.setFlagForReview(flagged);
        return room;
    }

    private static void validateRoomCount(Property parent, int requested) {
        BigDecimal bhk = parent.getBhk();
        if (bhk == null || bhk.compareTo(BigDecimal.valueOf(4)) >= 0) {
            return;
        }
        int ceiling = bhk.setScale(0, RoundingMode.FLOOR).intValue() + HALL;
        if (requested > ceiling) {
            throw new ValidationException(
                    "A " + bhk.stripTrailingZeros().toPlainString() + " BHK has at most " + ceiling
                            + " lettable rooms (bedrooms plus the hall); you listed "
                            + requested + ".");
        }
    }

    private static String bhkLabel(BigDecimal bhk) {
        if (bhk == null) {
            return null;
        }
        int whole = bhk.setScale(0, RoundingMode.FLOOR).intValue();
        return String.valueOf(Math.clamp(whole, 1, 4));
    }

    private static void validateOccupancy(int maxOccupants, int roomCount) {
        int floor = roomCount;
        int ceiling = roomCount * MAX_PER_ROOM;
        if (maxOccupants < floor || maxOccupants > ceiling) {
            throw new ValidationException(
                    "With " + roomCount + " rooms the flat cap must be between " + floor
                            + " and " + ceiling + "; you gave " + maxOccupants + ".");
        }
    }
}

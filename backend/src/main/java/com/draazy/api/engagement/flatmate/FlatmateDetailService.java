package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.user.UserStatuses;
import com.draazy.api.security.AuthPrincipal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateDetailService {

    private final FlatmateGroupRepository groups;
    private final FlatmateRoomRepository rooms;
    private final FlatmateSeekerPostRepository posts;
    private final FlatmateRoomCards cards;
    private final FlatmateReviewStatuses reviewStatuses;
    private final FlatmateReviewRepository reviews;
    private final FlatmateMapper mapper;
    private final UserRepository users;

    FlatmateDetailService(FlatmateGroupRepository groups, FlatmateRoomRepository rooms,
            FlatmateSeekerPostRepository posts, FlatmateRoomCards cards,
            FlatmateReviewStatuses reviewStatuses, FlatmateReviewRepository reviews,
            FlatmateMapper mapper, UserRepository users) {
        this.groups = groups;
        this.rooms = rooms;
        this.posts = posts;
        this.cards = cards;
        this.reviewStatuses = reviewStatuses;
        this.reviews = reviews;
        this.mapper = mapper;
        this.users = users;
    }

    @Transactional(readOnly = true)
    public FlatmateDetailDto group(AuthPrincipal caller, UUID id) {
        FlatmateGroup group = groups.findById(id).filter(g -> !g.isArchived())
                .filter(g -> isHost(caller, g.getHostId()) || g.isVisible() && hostActive(g.getHostId()))
                .orElseThrow(() -> NotFoundException.of("Group"));
        String verdict = reviewStatuses.forGroups(List.of(group)).get(group.getId());
        if (isHost(caller, group.getHostId())) {
            User me = users.findById(caller.userId()).orElse(null);
            FlatmateGroupDto dto = mapper.toDto(group,
                    new FlatmateMapper.PartyView(nameOf(me), mobileOf(me), verdict));
            return FlatmateDetailDto.owned(FlatmateDetailDto.KIND_GROUP,
                    withConsentMobile(dto, group.getOwnerConsentMobile()), List.of(),
                    reviews.findByGroupId(group.getId()).map(FlatmateDetailDto.Verification::of)
                            .orElse(null));
        }
        String hostName = users.findById(group.getHostId()).map(User::getName).orElse(null);
        return FlatmateDetailDto.visitor(FlatmateDetailDto.KIND_GROUP,
                mapper.toFeedDto(group, FlatmateMapper.PartyView.anonymous(hostName, verdict)),
                List.of());
    }

    @Transactional(readOnly = true)
    public FlatmateDetailDto room(AuthPrincipal caller, UUID id) {
        FlatmateRoom room = rooms.findById(id).filter(r -> !r.isArchived())
                .filter(r -> isHost(caller, r.getHostId()) || r.isVisible() && hostActive(r.getHostId()))
                .orElseThrow(() -> NotFoundException.of("Room"));
        List<String> photos = List.copyOf(room.getPhotos());
        FlatmateDetailDto.Specs specs = FlatmateDetailDto.Specs.of(room.getDetails());
        if (isHost(caller, room.getHostId())) {
            User me = users.findById(caller.userId()).orElse(null);
            Optional<FlatmateReview> review = reviews.findByRoomId(room.getId());
            FlatmateMapper.RoomView view = cards.ownerViews(List.of(room), nameOf(me), mobileOf(me))
                    .get(room.getId()).withHost(hostAnswers(room, review));
            return FlatmateDetailDto.owned(FlatmateDetailDto.KIND_ROOM,
                    mapper.toDto(room, view), photos,
                    review.map(FlatmateDetailDto.Verification::of).orElse(null)).withSpecs(specs);
        }
        return FlatmateDetailDto.visitor(FlatmateDetailDto.KIND_ROOM,
                cards.render(List.of(room)).get(0), photos).withSpecs(specs);
    }

    @Transactional(readOnly = true)
    public FlatmateDetailDto post(AuthPrincipal caller, UUID id) {
        FlatmateSeekerPost post = posts.findById(id).filter(p -> !p.isArchived())
                .filter(p -> isHost(caller, p.getUserId()) || p.isVisible() && hostActive(p.getUserId()))
                .orElseThrow(() -> NotFoundException.of("Flatmate post"));
        if (isHost(caller, post.getUserId())) {
            String mobile = users.findById(caller.userId()).map(User::getMobile).orElse(null);
            return FlatmateDetailDto.owned(FlatmateDetailDto.KIND_POST,
                    mapper.toDto(post, new FlatmateMapper.SeekerView(mobile)), List.of(), null);
        }
        return FlatmateDetailDto.visitor(FlatmateDetailDto.KIND_POST,
                mapper.toFeedDto(post), List.of());
    }

    private boolean hostActive(UUID hostId) {
        return users.findById(hostId).filter(u -> UserStatuses.ACTIVE.equals(u.getStatus()) && !u.isArchived()).isPresent();
    }

    private static boolean isHost(AuthPrincipal caller, UUID hostId) {
        return caller != null && caller.userId() != null && caller.userId().equals(hostId);
    }

    private static FlatmateRoomDto.Host hostAnswers(FlatmateRoom room, Optional<FlatmateReview> review) {
        AgreementRegistration agreement = review.map(FlatmateReview::getAgreement)
                .orElseGet(AgreementRegistration::new);
        return new FlatmateRoomDto.Host(room.getDetails(),
                review.map(FlatmateReview::getAgreementDoc).map(FlatmateDetailService::withoutBytes)
                        .orElse(null),
                agreement.getValidTill(),
                room.getOwnerConsentMobile(),
                attachedFlat(room, review),
                review.map(FlatmateReview::getReason).orElse(null),
                review.map(FlatmateReview::isOwnerConsent).orElse(null));
    }

    /** A spare room never stores the flat it claimed, so the edit form gets it back from wherever the claim
     * was kept — the address fingerprint for an owner, the review for a tenant — or a re-save drops the tier. */
    private static UUID attachedFlat(FlatmateRoom room, Optional<FlatmateReview> review) {
        String fingerprint = room.getAddressFingerprint();
        if (fingerprint != null && fingerprint.startsWith(FlatmateGuardrails.PROPERTY_PREFIX)) {
            return Ids.parseUuid(fingerprint.substring(FlatmateGuardrails.PROPERTY_PREFIX.length())).orElse(null);
        }
        return review.map(FlatmateReview::getTenancyPropertyId).orElse(null);
    }

    private static Map<String, Object> withoutBytes(Map<String, Object> doc) {
        Map<String, Object> named = new LinkedHashMap<>();
        for (String key : List.of("id", "name", "mime", "size")) {
            if (doc.get(key) != null) {
                named.put(key, doc.get(key));
            }
        }
        return named;
    }

    private static FlatmateGroupDto withConsentMobile(FlatmateGroupDto d, String mobile) {
        return new FlatmateGroupDto(d.id(), d.title(), d.locality(), d.policy(), d.rent(), d.deposit(),
                d.noticePeriodDays(), d.lockInMonths(), d.maintenanceBilling(), d.electricityBilling(),
                d.perHead(), d.seatsTotal(), d.seatsOpen(), d.members(), d.propertyId(), d.hostRole(),
                d.verificationTier(), d.agreementDeclared(), d.ownerConsent(), mobile, d.reviewStatus(),
                d.addressFingerprint(), d.flagForReview(), d.modStatus(), d.note(),
                d.ownerName(), d.ownerMobile(), d.createdAt(), d.preferences());
    }

    private static String nameOf(User user) {
        return user == null ? null : user.getName();
    }

    private static String mobileOf(User user) {
        return user == null ? null : user.getMobile();
    }
}

package com.draazy.api.deals.visit;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.RequestSource;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class VisitRequestSource implements RequestSource {

    private final VisitRepository visits;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final VisitService visitService;

    VisitRequestSource(VisitRepository visits, PropertyRepository properties, UserRepository users,
            VisitService visitService) {
        this.visits = visits;
        this.properties = properties;
        this.users = users;
        this.visitService = visitService;
    }

    @Override
    public String kind() {
        return "visit";
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> sent(UUID requesterId, Instant since) {
        return toViews(visits.findSentSince(requesterId, since), false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> received(UUID recipientId, Instant since) {
        List<UUID> owned = properties.findIdsByOwnerId(recipientId);
        if (owned.isEmpty()) {
            return List.of();
        }
        return toViews(visits.findReceivedSince(owned, Instant.now(), since), true);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RequestView> findSent(UUID requesterId, UUID id) {
        return visits.findByIdAndVisitorId(id, requesterId)
                .flatMap(visit -> toViews(List.of(visit), false).stream().findFirst());
    }

    @Override
    public void withdraw(UUID requesterId, UUID id) {
        visitService.updateStatus(new AuthPrincipal(requesterId, null, null, true, true), id,
                new VisitStatusUpdateRequest(VisitStatuses.CANCELLED, null));
    }

    private List<RequestView> toViews(List<Visit> rows, boolean received) {
        Map<UUID, Property> listings = byId(properties.findAllById(
                rows.stream().map(Visit::getPropertyId).distinct().toList()), Property::getId);
        Collection<UUID> partyIds = rows.stream()
                .map(v -> received ? v.getVisitorId() : ownerId(listings.get(v.getPropertyId())))
                .filter(Objects::nonNull).distinct().toList();
        Map<UUID, User> people = byId(users.findAllById(partyIds), User::getId);
        Instant now = Instant.now();
        return rows.stream().map(visit -> {
            Property listing = listings.get(visit.getPropertyId());
            UUID ownerId = ownerId(listing);
            UUID partyId = received ? visit.getVisitorId() : ownerId;
            return view(visit, listing, ownerId, party(partyId, people.get(partyId)), now);
        }).toList();
    }

    private RequestView view(Visit visit, Property listing, UUID ownerId, Party party, Instant now) {
        String state = switch (visit.getStatus()) {
            case VisitStatuses.SCHEDULED -> visit.getSlot().isAfter(now) ? PENDING : EXPIRED;
            case VisitStatuses.CANCELLED -> visit.isCancelledByVisitor() ? WITHDRAWN : DECLINED;
            default -> ACCEPTED;
        };
        Target target = new Target(visit.getPropertyId(), "property", listing == null ? null : listing.getTitle(),
                "/property/" + (listing == null || listing.getSlug() == null ? visit.getPropertyId() : listing.getSlug()));
        Instant decidedAt = PENDING.equals(state) ? null
                : visit.getConfirmedAt() != null && ACCEPTED.equals(state) ? visit.getConfirmedAt() : visit.getUpdatedAt();
        return new RequestView(visit.getId(), kind(), state, visit.getStatus(), party, target, visit.getNote(),
                visit.getSlot(), visit.getCreatedAt(), decidedAt, visit.getSlot(), ownerId);
    }

    private static UUID ownerId(Property listing) {
        return listing == null || listing.getOwner() == null ? null : listing.getOwner().getId();
    }

    private static Party party(UUID id, User user) {
        String name = user == null || user.getName() == null || user.getName().isBlank() ? "Someone" : user.getName();
        return new Party(id, name, user != null && user.isVerified());
    }

    private static <T> Map<UUID, T> byId(Collection<T> items, Function<T, UUID> id) {
        return items.stream().collect(Collectors.toMap(id, Function.identity()));
    }
}

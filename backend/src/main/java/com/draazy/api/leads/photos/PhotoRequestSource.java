package com.draazy.api.leads.photos;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.RequestSource;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
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
class PhotoRequestSource implements RequestSource {

    private final PhotoRequestRepository photoRequests;
    private final PropertyRepository properties;
    private final UserRepository users;

    PhotoRequestSource(PhotoRequestRepository photoRequests, PropertyRepository properties, UserRepository users) {
        this.photoRequests = photoRequests;
        this.properties = properties;
        this.users = users;
    }

    @Override
    public String kind() {
        return "photo";
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> sent(UUID requesterId, Instant since) {
        return toViews(photoRequests.findSentSince(requesterId, since), false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> received(UUID recipientId) {
        List<UUID> owned = properties.findIdsByOwnerId(recipientId);
        if (owned.isEmpty()) {
            return List.of();
        }
        return toViews(photoRequests.findByPropertyIdInAndStatus(owned, PhotoRequestStatuses.PENDING), true);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RequestView> findSent(UUID requesterId, UUID id) {
        return photoRequests.findByIdAndRequesterId(id, requesterId)
                .flatMap(row -> toViews(List.of(row), false).stream().findFirst());
    }

    @Override
    @Transactional
    public void withdraw(UUID requesterId, UUID id) {
        if (photoRequests.withdrawIfPending(id, requesterId) == 0) {
            throw RequestSource.alreadyAnswered();
        }
    }

    private List<RequestView> toViews(List<PhotoRequest> rows, boolean received) {
        Map<UUID, Property> listings = byId(properties.findAllById(
                rows.stream().map(PhotoRequest::getPropertyId).distinct().toList()), Property::getId);
        Collection<UUID> partyIds = rows.stream().map(row -> received ? row.getRequesterId() : ownerId(listings.get(row.getPropertyId())))
                .filter(Objects::nonNull).distinct().toList();
        Map<UUID, User> people = byId(users.findAllById(partyIds), User::getId);
        return rows.stream().map(row -> {
            Property listing = listings.get(row.getPropertyId());
            UUID ownerId = ownerId(listing);
            UUID partyId = received ? row.getRequesterId() : ownerId;
            return view(row, listing, ownerId, party(partyId, people.get(partyId)));
        }).toList();
    }

    private RequestView view(PhotoRequest row, Property listing, UUID ownerId, Party party) {
        String state = switch (row.getStatus()) {
            case PhotoRequestStatuses.RESOLVED -> ACCEPTED;
            case PhotoRequestStatuses.DECLINED -> DECLINED;
            case PhotoRequestStatuses.WITHDRAWN -> WITHDRAWN;
            default -> PENDING;
        };
        Target target = new Target(row.getPropertyId(), "property", listing == null ? null : listing.getTitle(),
                "/property/" + (listing == null || listing.getSlug() == null ? row.getPropertyId() : listing.getSlug()));
        Instant decidedAt = PENDING.equals(state) ? null
                : row.getDecidedAt() != null ? row.getDecidedAt() : row.getUpdatedAt();
        return new RequestView(row.getId(), kind(), state, row.getStatus(), party, target, null, null,
                row.getCreatedAt(), decidedAt, null, ownerId);
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

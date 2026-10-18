package com.draazy.api.leads.contact;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.RequestSource;
import com.draazy.api.common.trust.VerifiedTenantLookup;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class ContactRequestSource implements RequestSource {

    private final ContactRequestRepository requests;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final VerifiedTenantLookup verifiedTenants;
    private final ContactReplyWindow window;

    ContactRequestSource(ContactRequestRepository requests, PropertyRepository properties, UserRepository users,
            VerifiedTenantLookup verifiedTenants, ContactReplyWindow window) {
        this.requests = requests;
        this.properties = properties;
        this.users = users;
        this.verifiedTenants = verifiedTenants;
        this.window = window;
    }

    @Override
    public String kind() {
        return "contact";
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> sent(UUID requesterId, Instant since) {
        return toSentViews(requests.findSentSince(requesterId, since));
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> received(UUID recipientId) {
        List<UUID> owned = properties.findIdsByOwnerId(recipientId);
        if (owned.isEmpty()) {
            return List.of();
        }
        List<ContactRequest> rows = requests.findOpenForProperties(owned, window.cutoff(Instant.now()));
        Map<UUID, Property> listings = listingsOf(rows);
        Map<UUID, User> requesters = usersById(rows.stream().map(ContactRequest::getRequesterId).toList());
        Set<UUID> verified = verifiedTenants.verifiedAmong(requesters.keySet());
        return rows.stream().map(row -> {
            User requester = requesters.get(row.getRequesterId());
            return view(row, listings.get(row.getPropertyId()), recipientId,
                    party(row.getRequesterId(), requester, verified.contains(row.getRequesterId())));
        }).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RequestView> findSent(UUID requesterId, UUID id) {
        return requests.findByIdAndRequesterId(id, requesterId)
                .flatMap(row -> toSentViews(List.of(row)).stream().findFirst());
    }

    @Override
    @Transactional
    public void withdraw(UUID requesterId, UUID id) {
        boolean withdrawn = requests.findByIdAndRequesterId(id, requesterId).map(row -> requests.updateStatusIfCurrent(
                row.getId(), ContactRequestStatuses.PENDING, ContactRequestStatuses.WITHDRAWN) > 0).orElse(false);
        if (!withdrawn) {
            throw RequestSource.alreadyAnswered();
        }
    }

    private List<RequestView> toSentViews(List<ContactRequest> rows) {
        Map<UUID, Property> listings = listingsOf(rows);
        Map<UUID, User> owners = usersById(listings.values().stream()
                .map(p -> p.getOwner() == null ? null : p.getOwner().getId()).filter(java.util.Objects::nonNull).toList());
        return rows.stream().map(row -> {
            Property listing = listings.get(row.getPropertyId());
            UUID ownerId = listing == null || listing.getOwner() == null ? null : listing.getOwner().getId();
            User owner = owners.get(ownerId);
            return view(row, listing, ownerId, party(ownerId, owner, owner != null && owner.isVerified()));
        }).toList();
    }

    private RequestView view(ContactRequest row, Property listing, UUID recipientId, Party party) {
        Instant now = Instant.now();
        boolean lapsed = window.lapsed(row.getStatus(), row.getCreatedAt(), now);
        String state = lapsed ? EXPIRED : switch (row.getStatus()) {
            case ContactRequestStatuses.APPROVED -> ACCEPTED;
            case ContactRequestStatuses.DECLINED -> DECLINED;
            case ContactRequestStatuses.WITHDRAWN -> WITHDRAWN;
            case ContactRequestStatuses.EXPIRED -> EXPIRED;
            default -> PENDING;
        };
        Target target = new Target(row.getPropertyId(), "property", listing == null ? null : listing.getTitle(),
                "/property/" + (listing == null || listing.getSlug() == null ? row.getPropertyId() : listing.getSlug()));
        boolean open = PENDING.equals(state);
        return new RequestView(row.getId(), kind(), state, row.getStatus(), party, target, row.getMessage(), null,
                row.getCreatedAt(), open ? null : row.getUpdatedAt(), window.expiresAt(row.getCreatedAt()), recipientId);
    }

    private static Party party(UUID id, User user, boolean verified) {
        String name = user == null || user.getName() == null || user.getName().isBlank() ? "Someone" : user.getName();
        return new Party(id, name, verified);
    }

    private Map<UUID, Property> listingsOf(List<ContactRequest> rows) {
        return properties.findAllById(rows.stream().map(ContactRequest::getPropertyId).distinct().toList()).stream()
                .collect(Collectors.toMap(Property::getId, Function.identity()));
    }

    private Map<UUID, User> usersById(Collection<UUID> ids) {
        return users.findAllById(ids.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
    }
}

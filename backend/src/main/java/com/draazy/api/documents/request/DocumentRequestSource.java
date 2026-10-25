package com.draazy.api.documents.request;

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
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class DocumentRequestSource implements RequestSource {

    private final DocumentRequestRepository requests;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final VerifiedTenantLookup verifiedTenants;

    DocumentRequestSource(DocumentRequestRepository requests, PropertyRepository properties, UserRepository users,
            VerifiedTenantLookup verifiedTenants) {
        this.requests = requests;
        this.properties = properties;
        this.users = users;
        this.verifiedTenants = verifiedTenants;
    }

    @Override
    public String kind() {
        return "document";
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> sent(UUID requesterId, Instant since) {
        return toSentViews(requests.findSentSince(requesterId, since));
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> received(UUID recipientId, Instant since) {
        List<UUID> owned = properties.findIdsByOwnerId(recipientId);
        if (owned.isEmpty()) {
            return List.of();
        }
        List<DocumentRequest> rows = requests.findReceivedSince(owned, since);
        Map<UUID, Property> listings = listingsOf(rows);
        Map<UUID, User> requesters = usersById(rows.stream().map(DocumentRequest::getRequesterId).toList());
        Set<UUID> verified = verifiedTenants.verifiedAmong(requesters.keySet());
        return rows.stream().map(row -> view(row, listings.get(row.getPropertyId()), recipientId,
                party(row.getRequesterId(), requesters.get(row.getRequesterId()),
                        verified.contains(row.getRequesterId())))).toList();
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
                row.getId(), DocumentRequestStatuses.PENDING, DocumentRequestStatuses.WITHDRAWN) > 0).orElse(false);
        if (!withdrawn) {
            throw RequestSource.alreadyAnswered();
        }
    }

    private List<RequestView> toSentViews(List<DocumentRequest> rows) {
        Map<UUID, Property> listings = listingsOf(rows);
        Map<UUID, User> owners = usersById(listings.values().stream()
                .map(p -> p.getOwner() == null ? null : p.getOwner().getId()).filter(Objects::nonNull).toList());
        return rows.stream().map(row -> {
            Property listing = listings.get(row.getPropertyId());
            UUID ownerId = listing == null || listing.getOwner() == null ? null : listing.getOwner().getId();
            User owner = owners.get(ownerId);
            return view(row, listing, ownerId, party(ownerId, owner, owner != null && owner.isVerified()));
        }).toList();
    }

    private RequestView view(DocumentRequest row, Property listing, UUID recipientId, Party party) {
        boolean lapsed = DocumentRequestStatuses.GRANTED.equals(row.getStatus())
                && row.getExpiresAt() != null && !row.getExpiresAt().isAfter(Instant.now());
        String status = lapsed ? DocumentRequestStatuses.EXPIRED : row.getStatus();
        String state = switch (status) {
            case DocumentRequestStatuses.GRANTED -> ACCEPTED;
            case DocumentRequestStatuses.DECLINED -> DECLINED;
            case DocumentRequestStatuses.WITHDRAWN -> WITHDRAWN;
            case DocumentRequestStatuses.EXPIRED -> EXPIRED;
            default -> PENDING;
        };
        Target target = new Target(row.getPropertyId(), "property", listing == null ? null : listing.getTitle(),
                "/property/" + (listing == null || listing.getSlug() == null ? row.getPropertyId() : listing.getSlug()));
        return new RequestView(row.getId(), kind(), state, status, party, target, message(row), null,
                row.getCreatedAt(), PENDING.equals(state) ? null : row.getUpdatedAt(), row.getExpiresAt(),
                recipientId);
    }

    private static String message(DocumentRequest row) {
        if (row.getMessage() != null && !row.getMessage().isBlank()) {
            return row.getMessage();
        }
        List<String> categories = row.getCategories();
        return categories.isEmpty() ? "Wants to see the property documents."
                : "Wants to see: " + String.join(", ", categories);
    }

    private static Party party(UUID id, User user, boolean verified) {
        String name = user == null || user.getName() == null || user.getName().isBlank() ? "Someone" : user.getName();
        return new Party(id, name, verified);
    }

    private Map<UUID, Property> listingsOf(List<DocumentRequest> rows) {
        return properties.findAllById(rows.stream().map(DocumentRequest::getPropertyId).distinct().toList()).stream()
                .collect(Collectors.toMap(Property::getId, Function.identity()));
    }

    private Map<UUID, User> usersById(Collection<UUID> ids) {
        return users.findAllById(ids.stream().distinct().toList()).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
    }
}

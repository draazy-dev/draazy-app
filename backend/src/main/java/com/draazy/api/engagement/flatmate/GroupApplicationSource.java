package com.draazy.api.engagement.flatmate;

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
class GroupApplicationSource implements RequestSource {

    private final FlatmateGroupApplicationRepository applications;
    private final PropertyRepository properties;
    private final UserRepository users;

    GroupApplicationSource(FlatmateGroupApplicationRepository applications, PropertyRepository properties,
            UserRepository users) {
        this.applications = applications;
        this.properties = properties;
        this.users = users;
    }

    @Override
    public String kind() {
        return "group";
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> sent(UUID requesterId, Instant since) {
        return toViews(applications.findSentSince(requesterId, FlatmateVocabulary.MOD_PUBLIC, since), false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> received(UUID recipientId) {
        List<UUID> owned = properties.findIdsByOwnerId(recipientId);
        if (owned.isEmpty()) {
            return List.of();
        }
        return toViews(applications.findByListingIdInAndStatusAndModStatusIn(
                owned, FlatmateVocabulary.STATUS_PENDING, FlatmateVocabulary.MOD_PUBLIC), true);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RequestView> findSent(UUID requesterId, UUID id) {
        return applications.findByIdAndApplicantId(id, requesterId)
                .filter(row -> FlatmateVocabulary.isPublic(row.getModStatus()))
                .flatMap(row -> toViews(List.of(row), false).stream().findFirst());
    }

    @Override
    @Transactional
    public void withdraw(UUID requesterId, UUID id) {
        boolean withdrawn = applications.findByIdAndApplicantId(id, requesterId)
                .map(row -> applications.updateDecisionIfPending(
                        row.getId(), FlatmateVocabulary.STATUS_PENDING, WITHDRAWN, Instant.now()) > 0)
                .orElse(false);
        if (!withdrawn) {
            throw RequestSource.alreadyAnswered();
        }
    }

    private List<RequestView> toViews(List<FlatmateGroupApplication> rows, boolean received) {
        Map<UUID, Property> listings = properties
                .findAllById(rows.stream().map(FlatmateGroupApplication::getListingId).distinct().toList()).stream()
                .collect(Collectors.toMap(Property::getId, Function.identity()));
        Collection<UUID> partyIds = rows.stream()
                .map(row -> received ? row.getApplicantId() : ownerId(listings.get(row.getListingId())))
                .filter(Objects::nonNull).distinct().toList();
        Map<UUID, User> people = users.findAllById(partyIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
        return rows.stream().map(row -> {
            Property listing = listings.get(row.getListingId());
            UUID ownerId = ownerId(listing);
            UUID partyId = received ? row.getApplicantId() : ownerId;
            User person = people.get(partyId);
            String name = person == null || person.getName() == null || person.getName().isBlank()
                    ? "Someone" : person.getName();
            Target target = new Target(row.getListingId(), "property", listing == null ? null : listing.getTitle(),
                    "/property/" + (listing == null || listing.getSlug() == null ? row.getListingId() : listing.getSlug()));
            return new RequestView(row.getId(), kind(), row.getStatus(), row.getStatus(),
                    new Party(partyId, name, person != null && person.isVerified()), target, null, null,
                    row.getCreatedAt(), PENDING.equals(row.getStatus()) ? null : row.getDecidedAt(), null, ownerId);
        }).toList();
    }

    private static UUID ownerId(Property listing) {
        return listing == null || listing.getOwner() == null ? null : listing.getOwner().getId();
    }
}

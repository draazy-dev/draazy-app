package com.draazy.api.deals.offer;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.Notifier;
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
class OfferRequestSource implements RequestSource {

    private final OfferRepository offers;
    private final OfferHistoryRepository history;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final OfferService offerService;

    OfferRequestSource(OfferRepository offers, OfferHistoryRepository history, PropertyRepository properties,
            UserRepository users, OfferService offerService) {
        this.offers = offers;
        this.history = history;
        this.properties = properties;
        this.users = users;
        this.offerService = offerService;
    }

    @Override
    public String kind() {
        return "offer";
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> sent(UUID requesterId, Instant since) {
        return toViews(offers.findSentSince(requesterId, since), false);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RequestView> received(UUID recipientId, Instant since) {
        List<UUID> owned = properties.findIdsByOwnerId(recipientId);
        if (owned.isEmpty()) {
            return List.of();
        }
        return toViews(offers.findReceivedSince(owned, since), true);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RequestView> findSent(UUID requesterId, UUID id) {
        return offers.findById(id).filter(offer -> requesterId.equals(offer.getFromUserId()))
                .flatMap(offer -> toViews(List.of(offer), false).stream().findFirst());
    }

    @Override
    public void withdraw(UUID requesterId, UUID id) {
        offerService.withdraw(requesterId, id);
    }

    private List<RequestView> toViews(List<Offer> rows, boolean received) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<UUID, Property> listings = byId(properties.findAllById(
                rows.stream().map(Offer::getPropertyId).distinct().toList()), Property::getId);
        Map<UUID, String> lastBy = history.findByOfferIdInOrderByAtAsc(rows.stream().map(Offer::getId).toList())
                .stream().collect(Collectors.toMap(OfferHistory::getOfferId, OfferHistory::getBy, (a, b) -> b));
        Collection<UUID> partyIds = rows.stream()
                .map(o -> received ? o.getFromUserId() : ownerId(listings.get(o.getPropertyId())))
                .filter(Objects::nonNull).distinct().toList();
        Map<UUID, User> people = byId(users.findAllById(partyIds), User::getId);
        return rows.stream().map(offer -> {
            Property listing = listings.get(offer.getPropertyId());
            UUID ownerId = ownerId(listing);
            UUID partyId = received ? offer.getFromUserId() : ownerId;
            return view(offer, lastBy.get(offer.getId()), listing, ownerId, party(partyId, people.get(partyId)), received);
        }).toList();
    }

    private RequestView view(Offer offer, String lastBy, Property listing, UUID ownerId, Party party, boolean received) {
        boolean ownerMovedLast = OfferStatuses.BY_OWNER.equals(lastBy);
        // After the owner's counter the buyer answers next, so neither box treats it as pending.
        String state = switch (offer.getStatus()) {
            case OfferStatuses.PENDING, OfferStatuses.COUNTERED -> ownerMovedLast ? OfferStatuses.COUNTERED : PENDING;
            case OfferStatuses.ACCEPTED -> ACCEPTED;
            case OfferStatuses.WITHDRAWN -> WITHDRAWN;
            default -> DECLINED;
        };
        Target target = new Target(offer.getPropertyId(), "property", listing == null ? null : listing.getTitle(),
                "/property/" + (listing == null || listing.getSlug() == null ? offer.getPropertyId() : listing.getSlug()));
        Instant decidedAt = PENDING.equals(state) ? null : offer.getUpdatedAt();
        return new RequestView(offer.getId(), kind(), state, offer.getStatus(), party, target,
                message(offer, state, ownerMovedLast, received), null, offer.getCreatedAt(), decidedAt, null, ownerId);
    }

    private static String message(Offer offer, String state, boolean ownerMovedLast, boolean received) {
        String amount = Notifier.rupees(offer.getAmount());
        String line;
        if (ACCEPTED.equals(state)) {
            line = "Agreed at " + amount;
        } else if (ownerMovedLast) {
            line = (received ? "You countered at " : "Owner countered at ") + amount;
        } else if (OfferStatuses.COUNTERED.equals(offer.getStatus())) {
            line = "Countered at " + amount;
        } else {
            line = "Offered " + amount;
        }
        String note = offer.getMessage();
        return note == null || note.isBlank() ? line : line + ". " + note.strip();
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

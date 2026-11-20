package com.draazy.api.deals.offer;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.RequestSource;
import com.draazy.api.common.web.Ids;
import com.draazy.api.deals.deal.DealRepository;
import com.draazy.api.finance.tenancy.TenantProfileService;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OfferService {
    private static final Logger LOG = LoggerFactory.getLogger(OfferService.class);

    private final OfferRepository offers;
    private final OfferHistoryRepository history;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final DealRepository deals;
    private final Notifier notifier;
    private final TenantProfileService tenantProfiles;

    public OfferService(OfferRepository offers, OfferHistoryRepository history,
                        PropertyRepository properties, UserRepository users,
                        DealRepository deals, Notifier notifier,
                        TenantProfileService tenantProfiles) {
        this.offers = offers;
        this.history = history;
        this.properties = properties;
        this.users = users;
        this.deals = deals;
        this.notifier = notifier;
        this.tenantProfiles = tenantProfiles;
    }

    @Transactional
    public OfferDto submit(UUID callerId, OfferCreateRequest body) {
        Property property = Ids.parseUuid(body.propertyId())
                .flatMap(properties::findById)
                .filter(Property::isDirectlyReachable)
                .orElseThrow(() -> NotFoundException.of("Property"));
        UUID propertyId = property.getId();

        if (deals.findClosedByPropertyId(propertyId).isPresent()) {
            throw new ConflictException("A closed deal exists on this property");
        }

        if (!property.isPubliclyVisible()) {
            throw new ConflictException("This listing is not open to offers");
        }

        requireAboveFloor(property, body.amount());

        if (offers.findLiveByUserAndProperty(callerId, propertyId).isPresent()) {
            throw new ConflictException("You already have a live offer on this property");
        }

        Offer offer;
        try {
            offer = new Offer(propertyId, callerId, body.amount(), body.message(), body.moveIn());
            offer = offers.saveAndFlush(offer);
        } catch (DataIntegrityViolationException constraintViolation) {
            LOG.debug("Concurrent duplicate offer for user {} on property {}", callerId, propertyId);
            throw new ConflictException("You already have a live offer on this property");
        }

        OfferHistory entry = new OfferHistory(offer.getId(), offer.getAmount(), OfferStatuses.BY_BUYER);
        history.saveAndFlush(entry);

        User buyer = users.findById(callerId).orElse(null);

        UUID ownerId = property.getOwner().getId();
        if (!ownerId.equals(callerId)) {
            notifier.notify(ownerId, "offer.received",
                    "New offer on " + property.getTitle(),
                    (buyer == null || buyer.getName() == null || buyer.getName().isBlank()
                            ? "Someone" : buyer.getName())
                            + " offered " + Notifier.rupees(offer.getAmount()) + ". Open your requests to respond.",
                    Notifier.REQUEST_INBOX);
        }

        ContactVisibility visibility = buyerMobileVisibility(callerId, callerId);
        boolean verified = tenantProfiles.verifiedAmong(List.of(callerId)).contains(callerId);
        return OfferMapper.toDto(offer, buyer, List.of(entry), visibility, verified);
    }

    @Transactional
    public void respond(UUID callerId, UUID offerId, OfferRespondRequest body) {
        Offer offer = offers.findById(offerId)
                .orElseThrow(() -> NotFoundException.of("Offer"));

        Property property = properties.findById(offer.getPropertyId())
                .orElseThrow(() -> NotFoundException.of("Offer"));
        UUID ownerId = property.getOwner().getId();

        boolean isBuyer = callerId.equals(offer.getFromUserId());
        boolean isOwner = callerId.equals(ownerId);
        if (!isBuyer && !isOwner) {
            throw NotFoundException.of("Offer");
        }

        // Owner-only: otherwise a buyer could accept their own offer and unmask a mobile
        // the owner never revealed. 403 not 404: the buyer is a legitimate participant.
        if (!isOwner && !OfferActions.COUNTER.equals(body.action())) {
            throw new ForbiddenException("Only the listing owner can " + body.action() + " an offer");
        }

        if (OfferActions.COUNTER.equals(body.action()) && body.counterAmount() == null) {
            throw new BadRequestException("counterAmount is required when action is 'counter'");
        }

        String targetStatus = mapActionToStatus(body.action(), body.counterAmount());

        if (!OfferStatuses.canTransition(offer.getStatus(), targetStatus)) {
            throw new ConflictException("This offer has already been " + offer.getStatus() + ".");
        }
        if (OfferActions.COUNTER.equals(body.action())) {
            requireAboveFloor(property, body.counterAmount());
        }

        offer.setStatus(targetStatus);
        if (body.message() != null) {
            offer.setMessage(body.message());
        }
        if (OfferActions.COUNTER.equals(body.action())) {
            offer.setAmount(body.counterAmount());
        }
        offers.save(offer);

        if (OfferActions.COUNTER.equals(body.action())) {
            String by = isBuyer ? OfferStatuses.BY_BUYER : OfferStatuses.BY_OWNER;
            history.save(new OfferHistory(offer.getId(), body.counterAmount(), by));
        }

        UUID other = isOwner ? offer.getFromUserId() : ownerId;
        if (!other.equals(callerId)) {
            String title = property.getTitle();
            String[] note = switch (targetStatus) {
                case OfferStatuses.ACCEPTED -> new String[] {"Your offer was accepted",
                        "The owner accepted " + Notifier.rupees(offer.getAmount()) + " for " + title + "."};
                case OfferStatuses.DECLINED -> new String[] {"Your offer was declined",
                        "The owner declined your offer on " + title + "."};
                default -> new String[] {"New counter-offer on " + title,
                        (isOwner ? "The owner" : "The buyer") + " countered at "
                                + Notifier.rupees(offer.getAmount()) + (isOwner ? ". Open the listing to respond."
                                : ". Open your requests to respond.")};
            };
            String link = isOwner ? "/property/" + property.getId() : Notifier.REQUEST_INBOX;
            notifier.notify(other, "offer." + targetStatus, note[0], note[1], link);
        }
    }

    @Transactional
    public void withdraw(UUID callerId, UUID offerId) {
        Offer offer = offers.findById(offerId).filter(o -> callerId.equals(o.getFromUserId()))
                .orElseThrow(() -> NotFoundException.of("Offer"));
        if (!OfferStatuses.canTransition(offer.getStatus(), OfferStatuses.WITHDRAWN)) {
            throw RequestSource.alreadyAnswered();
        }
        offer.setStatus(OfferStatuses.WITHDRAWN);
        offers.save(offer);
    }

    @Transactional(readOnly = true)
    public Page<OfferDto> myOffers(UUID callerId, UUID propertyId, Pageable pageable) {
        Page<Offer> rows = propertyId == null
                ? offers.findByFromUserIdOrderByCreatedAtDesc(callerId, pageable)
                : offers.findByFromUserIdAndPropertyIdOrderByCreatedAtDesc(callerId, propertyId, pageable);
        return projectPage(rows, callerId);
    }

    @Transactional(readOnly = true)
    public Page<OfferDto> offersOnMine(UUID callerId, UUID propertyId, Pageable pageable) {
        List<UUID> ownedPropertyIds = properties.findIdsByOwnerId(callerId);
        if (propertyId != null) {
            ownedPropertyIds = ownedPropertyIds.contains(propertyId) ? List.of(propertyId) : List.of();
        }
        if (ownedPropertyIds.isEmpty()) {
            return Page.empty(pageable);
        }
        Page<Offer> rows = offers.findByPropertyIdInOrderByCreatedAtDesc(ownedPropertyIds, pageable);
        return projectPage(rows, callerId);
    }

    private Page<OfferDto> projectPage(Page<Offer> rows, UUID viewerId) {
        return new PageImpl<>(projectOffers(rows.getContent(), viewerId),
                rows.getPageable(), rows.getTotalElements());
    }

    private List<OfferDto> projectOffers(List<Offer> rows, UUID viewerId) {
        if (rows.isEmpty()) {
            return List.of();
        }

        Map<UUID, User> buyerMap = users.findAllById(
                        rows.stream().map(Offer::getFromUserId).distinct().toList())
                .stream().collect(Collectors.toMap(User::getId, Function.identity()));

        List<UUID> offerIds = rows.stream().map(Offer::getId).toList();
        Map<UUID, List<OfferHistory>> historyMap = history.findByOfferIdInOrderByAtAsc(offerIds)
                .stream().collect(Collectors.groupingBy(OfferHistory::getOfferId));

        Set<UUID> verifiedBuyers = tenantProfiles.verifiedAmong(buyerMap.keySet());

        return rows.stream().map(offer -> {
            User buyer = buyerMap.get(offer.getFromUserId());
            List<OfferHistory> trail = historyMap.getOrDefault(offer.getId(), List.of());
            ContactVisibility visibility = buyerMobileVisibility(viewerId, offer.getFromUserId());
            return OfferMapper.toDto(offer, buyer, trail, visibility,
                    verifiedBuyers.contains(offer.getFromUserId()));
        }).toList();
    }

    private ContactVisibility buyerMobileVisibility(UUID viewerId, UUID buyerUserId) {
        return viewerId.equals(buyerUserId) ? ContactVisibility.REVEALED : ContactVisibility.MASKED;
    }

    private static void requireAboveFloor(Property property, long amount) {
        Long asking = property.getPrice();
        if (asking == null) {
            return;
        }
        long floor = (asking + 1) / 2;
        if (amount < floor) {
            throw new ValidationException("Offer at least " + Notifier.rupees(floor)
                    + ", half the asking price of " + Notifier.rupees(asking) + ".");
        }
    }

    private static String mapActionToStatus(String action, Long counterAmount) {
        return switch (action) {
            case OfferActions.ACCEPT -> OfferStatuses.ACCEPTED;
            case OfferActions.DECLINE -> OfferStatuses.DECLINED;
            case OfferActions.COUNTER -> OfferStatuses.COUNTERED;
            default -> throw new BadRequestException("Unknown action: " + action);
        };
    }
}

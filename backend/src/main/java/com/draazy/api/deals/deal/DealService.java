package com.draazy.api.deals.deal;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.AvailableOn;
import com.draazy.api.catalog.property.DealIntent;
import com.draazy.api.catalog.property.PropertyLifecycle;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.finance.tenancy.TenancyService;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DealService {

    private static final Logger LOG = LoggerFactory.getLogger(DealService.class);

    private final DealRepository deals;
    private final DealPartyRepository parties;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final PropertyLifecycle lifecycle;

    // Deal state owns tenancy side effects, so the transaction crosses into finance.
    private final TenancyService tenancyService;

    public DealService(DealRepository deals, DealPartyRepository parties,
                       PropertyRepository properties, UserRepository users,
                       PropertyLifecycle lifecycle, TenancyService tenancyService) {
        this.deals = deals;
        this.parties = parties;
        this.properties = properties;
        this.users = users;
        this.lifecycle = lifecycle;
        this.tenancyService = tenancyService;
    }

    @Transactional(readOnly = true)
    public DealDto getDeal(UUID callerId, UUID propertyId) {
        Property property = ownedProperty(callerId, propertyId);
        return deals.findByPropertyId(propertyId)
                .map(deal -> {
                    User counterparty = deal.getCounterpartyId() != null
                            ? users.findById(deal.getCounterpartyId()).orElse(null)
                            : null;
                    return DealMapper.toDto(deal, counterparty);
                })
                .orElseGet(() -> DealMapper.synthesizeActive(
                        propertyId.toString(), property.getDeal()));
    }

    @Transactional
    public void reserve(UUID callerId, UUID propertyId) {
        Property property = lockedOwnedProperty(callerId, propertyId);
        requireLive(property, "reserved");
        Deal deal = getOrCreate(propertyId, property.getDeal());

        if (!DealStatuses.canTransition(deal.getStatus(), DealStatuses.RESERVED)) {
            throw new ConflictException("This listing is already " + deal.getStatus() + ".");
        }
        deal.setStatus(DealStatuses.RESERVED);
        deals.save(deal);

        property.setDealStatus(DealStatuses.RESERVED);
    }

    @Transactional
    public void close(UUID callerId, UUID propertyId, DealCloseRequest body) {
        Property property = lockedOwnedProperty(callerId, propertyId);
        requireLive(property, "closed");
        Deal deal = getOrCreate(propertyId, property.getDeal());

        if (!DealStatuses.canTransition(deal.getStatus(), DealStatuses.CLOSED)) {
            throw new ConflictException("This deal is already " + deal.getStatus() + ".");
        }

        String normalised = MobileMask.normalise(body.counterpartyMobile());
        if (normalised == null) {
            throw new BadRequestException("counterpartyMobile must be a 10-digit mobile number");
        }
        deal.setCounterpartyMobile(normalised);
        deal.setAgreedPrice(body.agreedPrice());
        deal.setNote(body.note());
        deal.setStatus(DealStatuses.CLOSED);
        deal.setClosedAt(Instant.now());

        closeOut(property);

        users.findByMobile(normalised)
                .ifPresent(user -> deal.setCounterpartyId(user.getId()));

        deals.save(deal);

        proposeTenancy(property, callerId, deal.getCounterpartyId(), normalised, body.agreedPrice());
    }

    @Transactional
    public void reopen(AuthPrincipal caller, UUID propertyId, String availableOnRaw) {
        Property property = lockedOwnedProperty(caller.userId(), propertyId);
        requireReopenable(property);
        LocalDate availableOn = AvailableOn.resolve(availableOnRaw, null, false, property.getDeal());
        Deal deal = deals.findByPropertyId(propertyId)
                .orElseThrow(() -> new ConflictException("This listing is already open."));

        if (!DealStatuses.canTransition(deal.getStatus(), DealStatuses.ACTIVE)) {
            throw new ConflictException("This listing is already open.");
        }

        deal.setStatus(DealStatuses.ACTIVE);
        deal.setClosedAt(null);
        deal.setAgreedPrice(null);
        deal.setCounterpartyId(null);
        deal.setCounterpartyMobile(null);
        deal.setNote(null);
        deals.save(deal);

        if (!property.isArchived() && (PropertyStatus.SOLD.equals(property.getStatus())
                || PropertyStatus.RENTED.equals(property.getStatus()))) {
            lifecycle.reenterPending(caller, property);
            property.recordResubmission();
        }
        property.setDealStatus(DealStatuses.ACTIVE);
        if (availableOn != null) {
            property.setAvailableOn(availableOn);
        }

        // Otherwise the active-tenancy unique index stays occupied and the next tenant can never be let in.
        if (DealIntent.RENT.equals(property.getDeal())) {
            LocalDate today = AvailableOn.today();
            tenancyService.endActiveTenancy(propertyId,
                    availableOn != null && availableOn.isAfter(today) ? availableOn.minusDays(1) : today);
        }
    }

    @Transactional(readOnly = true)
    public List<DealPartyDto> listParties(UUID callerId, UUID propertyId) {
        ownedProperty(callerId, propertyId);
        return deals.findByPropertyId(propertyId)
                .map(deal -> parties.findLiveByDealId(deal.getId()).stream()
                        .map(DealMapper::toPartyDto)
                        .toList())
                .orElse(List.of());
    }

    @Transactional
    public void closeForFinalization(UUID ownerId, UUID propertyId, long agreedPrice,
                                     String counterpartyMobile, UUID counterpartyId) {
        Property property = lockedOwnedProperty(ownerId, propertyId);
        requireLive(property, "closed");
        Deal deal = getOrCreate(propertyId, property.getDeal());

        if (!DealStatuses.canTransition(deal.getStatus(), DealStatuses.CLOSED)) {
            throw new ConflictException("This deal is already " + deal.getStatus() + ".");
        }

        deal.setCounterpartyMobile(counterpartyMobile);
        deal.setCounterpartyId(counterpartyId);
        deal.setAgreedPrice(agreedPrice);
        deal.setStatus(DealStatuses.CLOSED);
        deal.setClosedAt(Instant.now());
        deals.save(deal);

        closeOut(property);
        proposeTenancy(property, ownerId, counterpartyId,
                MobileMask.normalise(counterpartyMobile), agreedPrice);
    }

    private void proposeTenancy(Property property, UUID ownerId, UUID tenantId,
                                String tenantMobile, long monthlyRent) {
        if (!DealIntent.RENT.equals(property.getDeal())) {
            return;
        }
        tenancyService.openFromClosedDeal(property.getId(), ownerId, tenantId, tenantMobile, monthlyRent)
                .ifPresentOrElse(
                        tenancy -> LOG.info("Tenancy {} proposed on rent close of property {}",
                                tenancy.getId(), property.getId()),
                        () -> LOG.info("Rent deal closed off-platform on property {}; "
                                + "no tenancy opened", property.getId()));
    }

    private void closeOut(Property property) {
        property.setStatus(terminalStatusFor(property));
        property.setDealStatus(DealStatuses.CLOSED);
        properties.endListingPasses(property.getId());
    }

    private Property lockedOwnedProperty(UUID callerId, UUID propertyId) {
        return properties.findOwnedForUpdate(propertyId, callerId)
                .orElseThrow(() -> NotFoundException.of("Property"));
    }

    private Property ownedProperty(UUID callerId, UUID propertyId) {
        return properties.findByIdAndOwner_Id(propertyId, callerId)
                .orElseThrow(() -> NotFoundException.of("Property"));
    }

    private static String terminalStatusFor(Property property) {
        return DealIntent.RENT.equals(property.getDeal())
                ? PropertyStatus.RENTED : PropertyStatus.SOLD;
    }

    private static void requireLive(Property property, String action) {
        if (!property.isPubliclyVisible()) {
            throw new ConflictException("Only a live approved listing can be " + action);
        }
    }

    // A closed deal's listing is sold/rented, so reopening must still reach it.
    private static void requireReopenable(Property property) {
        boolean closedOut = PropertyStatus.SOLD.equals(property.getStatus())
                || PropertyStatus.RENTED.equals(property.getStatus());
        if (property.isArchived() || !(closedOut || PropertyStatus.APPROVED.equals(property.getStatus()))) {
            throw new ConflictException("Only a live or closed listing can be reopened");
        }
    }

    private Deal getOrCreate(UUID propertyId, String dealIntent) {
        return deals.findByPropertyId(propertyId).orElseGet(() -> {
            try {
                Deal created = new Deal(propertyId, dealIntent);
                return deals.saveAndFlush(created);
            } catch (DataIntegrityViolationException constraint) {
                LOG.debug("Concurrent deal create for property {}, adopting winner", propertyId);
                return deals.findByPropertyId(propertyId)
                        .orElseThrow(() -> NotFoundException.of("Property"));
            }
        });
    }
}

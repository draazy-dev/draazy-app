package com.draazy.api.deals.finalization;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.Ids;
import com.draazy.api.deals.deal.DealService;
import com.draazy.api.deals.offer.Offer;
import com.draazy.api.deals.offer.OfferRepository;
import com.draazy.api.deals.offer.OfferStatuses;
import com.draazy.api.finance.tenancy.TenantProfileService;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FinalizationService {
    private static final Logger LOG = LoggerFactory.getLogger(FinalizationService.class);

    private final FinalizationRequestRepository finalizationRequests;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final DealService dealService;
    private final TenantProfileService tenantProfiles;
    private final OfferRepository offers;

    public FinalizationService(FinalizationRequestRepository finalizationRequests,
                               PropertyRepository properties,
                               UserRepository users,
                               DealService dealService,
                               TenantProfileService tenantProfiles,
                               OfferRepository offers) {
        this.finalizationRequests = finalizationRequests;
        this.properties = properties;
        this.users = users;
        this.dealService = dealService;
        this.tenantProfiles = tenantProfiles;
        this.offers = offers;
    }

    @Transactional
    public FinalizationRequestDto request(UUID callerId, UUID propertyId,
                                           FinalizationCreateRequest body) {
        if (body.propertyId() != null && !body.propertyId().isBlank()) {
            UUID bodyPropId = Ids.parseUuid(body.propertyId()).orElse(null);
            if (bodyPropId == null || !bodyPropId.equals(propertyId)) {
                throw new BadRequestException(
                        "Body propertyId must match the path parameter or be omitted");
            }
        }

        Property property = properties.findById(propertyId)
                .filter(Property::isPubliclyVisible)
                .orElseThrow(() -> NotFoundException.of("Property"));
        User counterparty = property.getOwner();

        String normalised = MobileMask.normalise(body.counterpartyMobile());
        if (normalised == null || !normalised.equals(MobileMask.normalise(counterparty.getMobile()))) {
            throw new BadRequestException(
                    "counterpartyMobile must be the listing owner's mobile number");
        }

        if (finalizationRequests.findLiveByInitiatorAndProperty(callerId, propertyId).isPresent()) {
            throw new ConflictException(
                    "You already have a pending finalization request on this property");
        }

        FinalizationRequest request;
        try {
            request = new FinalizationRequest(
                    propertyId, callerId, counterparty.getId(), agreedPrice(callerId, propertyId, body));
            request = finalizationRequests.saveAndFlush(request);
        } catch (DataIntegrityViolationException constraintViolation) {
            LOG.debug("Concurrent duplicate finalization request for user {} on property {}",
                    callerId, propertyId);
            throw new ConflictException(
                    "You already have a pending finalization request on this property");
        }

        User initiator = users.findById(callerId).orElse(null);
        return FinalizationMapper.toDto(request, initiator, counterparty, callerId,
                verifiedAmong(request));
    }

    @Transactional(readOnly = true)
    public Optional<FinalizationRequestDto> status(UUID callerId, UUID propertyId) {
        return finalizationRequests
                .findRecentByPropertyAndParticipant(propertyId, callerId, PageRequest.of(0, 1))
                .stream().findFirst()
                .map(request -> {
                    Map<UUID, User> userMap = batchLoadUsers(
                            request.getInitiatorId(), request.getCounterpartyId());
                    return FinalizationMapper.toDto(request,
                            userMap.get(request.getInitiatorId()),
                            userMap.get(request.getCounterpartyId()),
                            callerId,
                            verifiedAmong(request));
                });
    }

    @Transactional
    public void cancel(UUID callerId, UUID propertyId) {
        FinalizationRequest request = finalizationRequests
                .findLiveByPropertyAndParticipant(propertyId, callerId)
                .orElseThrow(() -> NotFoundException.of("Finalization request"));

        if (!callerId.equals(request.getInitiatorId())) {
            throw new ForbiddenException("Only the initiator may cancel a finalization request");
        }

        if (!FinalizationStatuses.canTransition(request.getStatus(), FinalizationStatuses.CANCELLED)) {
            throw new ConflictException("Cannot cancel a request in status " + request.getStatus());
        }

        request.setStatus(FinalizationStatuses.CANCELLED);
        finalizationRequests.saveAndFlush(request);
    }

    @Transactional(readOnly = true)
    public Page<FinalizationRequestDto> myRequests(UUID callerId, Pageable pageable) {
        Page<FinalizationRequest> rows =
                finalizationRequests.findPendingByCounterparty(callerId, pageable);
        if (rows.isEmpty()) {
            return new PageImpl<>(List.of(), rows.getPageable(), rows.getTotalElements());
        }

        List<UUID> userIds = rows.getContent().stream()
                .flatMap(r -> Stream.of(r.getInitiatorId(), r.getCounterpartyId()))
                .distinct()
                .toList();
        Map<UUID, User> userMap = users.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        Set<UUID> verified = tenantProfiles.verifiedAmong(userIds);

        List<FinalizationRequestDto> content = rows.getContent().stream()
                .map(r -> FinalizationMapper.toDto(r,
                        userMap.get(r.getInitiatorId()),
                        userMap.get(r.getCounterpartyId()),
                        callerId,
                        verified))
                .toList();
        return new PageImpl<>(content, rows.getPageable(), rows.getTotalElements());
    }

    @Transactional
    public void accept(UUID callerId, UUID requestId) {
        FinalizationRequest request = finalizationRequests.findByIdForUpdate(requestId)
                .orElseThrow(() -> NotFoundException.of("Finalization request"));

        if (!callerId.equals(request.getInitiatorId())
                && !callerId.equals(request.getCounterpartyId())) {
            throw NotFoundException.of("Finalization request");
        }

        if (callerId.equals(request.getInitiatorId())) {
            throw new ForbiddenException(
                    "The initiator cannot accept their own finalization request");
        }

        if (!FinalizationStatuses.canTransition(request.getStatus(), FinalizationStatuses.ACCEPTED)) {
            throw new ConflictException("This request has already been " + request.getStatus() + ".");
        }

        User initiator = users.findById(request.getInitiatorId()).orElse(null);
        String initiatorMobile = initiator != null ? initiator.getMobile() : null;
        dealService.closeForFinalization(
                request.getCounterpartyId(),
                request.getPropertyId(),
                request.getAgreedPrice(),
                initiatorMobile,
                request.getInitiatorId());

        request.setStatus(FinalizationStatuses.ACCEPTED);
        finalizationRequests.saveAndFlush(request);

        finalizationRequests.declineSiblings(request.getPropertyId(), request.getId());
    }

    @Transactional
    public void decline(UUID callerId, UUID requestId) {
        FinalizationRequest request = finalizationRequests.findByIdForUpdate(requestId)
                .orElseThrow(() -> NotFoundException.of("Finalization request"));

        if (!callerId.equals(request.getInitiatorId())
                && !callerId.equals(request.getCounterpartyId())) {
            throw NotFoundException.of("Finalization request");
        }

        if (callerId.equals(request.getInitiatorId())) {
            throw new ForbiddenException(
                    "The initiator cannot decline their own request; use cancel instead");
        }

        if (!FinalizationStatuses.canTransition(request.getStatus(), FinalizationStatuses.DECLINED)) {
            throw new ConflictException(
                    "Cannot decline a request in status " + request.getStatus());
        }

        request.setStatus(FinalizationStatuses.DECLINED);
        finalizationRequests.save(request);
    }

    private long agreedPrice(UUID buyerId, UUID propertyId, FinalizationCreateRequest body) {
        return offers.findFirstByFromUserIdAndPropertyIdAndStatusOrderByCreatedAtDesc(
                        buyerId, propertyId, OfferStatuses.ACCEPTED)
                .map(Offer::getAmount)
                .orElse(body.agreedPrice());
    }

    private Map<UUID, User> batchLoadUsers(UUID... ids) {
        return users.findAllById(List.of(ids)).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
    }

    private Set<UUID> verifiedAmong(FinalizationRequest request) {
        return tenantProfiles.verifiedAmong(
                List.of(request.getInitiatorId(), request.getCounterpartyId()));
    }
}

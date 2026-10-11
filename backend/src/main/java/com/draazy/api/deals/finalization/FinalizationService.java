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
import com.draazy.api.finance.tenancy.TenantProfileService;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.List;
import java.util.Map;
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

/** Maker/checker finalization: accepting auto-declines siblings and closes the deal in one transaction. */
@Service
public class FinalizationService {

    private static final Logger LOG = LoggerFactory.getLogger(FinalizationService.class);

    private final FinalizationRequestRepository finalizationRequests;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final DealService dealService;
    private final TenantProfileService tenantProfiles;

    public FinalizationService(FinalizationRequestRepository finalizationRequests,
                               PropertyRepository properties,
                               UserRepository users,
                               DealService dealService,
                               TenantProfileService tenantProfiles) {
        this.finalizationRequests = finalizationRequests;
        this.properties = properties;
        this.users = users;
        this.dealService = dealService;
        this.tenantProfiles = tenantProfiles;
    }

    // 404 for a missing or non-live listing; the counterparty must be a registered user (422).
    @Transactional
    public FinalizationRequestDto request(UUID callerId, UUID propertyId,
                                           FinalizationCreateRequest body) {
        // S4: if body carries a propertyId, it must equal the path.
        if (body.propertyId() != null && !body.propertyId().isBlank()) {
            UUID bodyPropId = Ids.parseUuid(body.propertyId()).orElse(null);
            if (bodyPropId == null || !bodyPropId.equals(propertyId)) {
                throw new BadRequestException(
                        "Body propertyId must match the path parameter or be omitted");
            }
        }

        // Property must exist. The owner is the only legitimate counterparty, so resolve them here.
        Property property = properties.findById(propertyId)
                .filter(Property::isPubliclyVisible)
                .orElseThrow(() -> NotFoundException.of("Property"));
        User counterparty = property.getOwner();

        // The counterparty comes from the listing; the body mobile is only validated, so it is no enumeration oracle.
        String normalised = MobileMask.normalise(body.counterpartyMobile());
        if (normalised == null || !normalised.equals(MobileMask.normalise(counterparty.getMobile()))) {
            throw new BadRequestException(
                    "counterpartyMobile must be the listing owner's mobile number");
        }

        // Duplicate prevention: service pre-check for a clean message.
        if (finalizationRequests.findLiveByInitiatorAndProperty(callerId, propertyId).isPresent()) {
            throw new ConflictException(
                    "You already have a pending finalization request on this property");
        }

        FinalizationRequest request;
        try {
            request = new FinalizationRequest(
                    propertyId, callerId, counterparty.getId(), body.agreedPrice());
            request = finalizationRequests.saveAndFlush(request);
        } catch (DataIntegrityViolationException constraintViolation) {
            // The partial unique index uq_finalization_live_per_user_property caught a concurrent
            // double-tap that slipped past the service-level check.
            LOG.debug("Concurrent duplicate finalization request for user {} on property {}",
                    callerId, propertyId);
            throw new ConflictException(
                    "You already have a pending finalization request on this property");
        }

        User initiator = users.findById(callerId).orElse(null);
        return FinalizationMapper.toDto(request, initiator, counterparty, callerId,
                verifiedAmong(request));
    }

    // Terminal rows are returned too, so a turned-down buyer can be told apart from one who never asked.
    @Transactional(readOnly = true)
    public FinalizationRequestDto status(UUID callerId, UUID propertyId) {
        FinalizationRequest request = finalizationRequests
                .findRecentByPropertyAndParticipant(propertyId, callerId, PageRequest.of(0, 1))
                .stream().findFirst()
                .orElseThrow(() -> NotFoundException.of("Finalization request"));

        Map<UUID, User> userMap = batchLoadUsers(
                request.getInitiatorId(), request.getCounterpartyId());
        return FinalizationMapper.toDto(request,
                userMap.get(request.getInitiatorId()),
                userMap.get(request.getCounterpartyId()),
                callerId,
                verifiedAmong(request));
    }

    // Initiator only; the counterparty declines instead (403), a stranger gets 404.
    @Transactional
    public void cancel(UUID callerId, UUID propertyId) {
        FinalizationRequest request = finalizationRequests
                .findLiveByPropertyAndParticipant(propertyId, callerId)
                .orElseThrow(() -> NotFoundException.of("Finalization request"));

        // Only the initiator may cancel.
        if (!callerId.equals(request.getInitiatorId())) {
            throw new ForbiddenException("Only the initiator may cancel a finalization request");
        }

        if (!FinalizationStatuses.canTransition(request.getStatus(), FinalizationStatuses.CANCELLED)) {
            throw new ConflictException("Cannot cancel a request in status " + request.getStatus());
        }

        request.setStatus(FinalizationStatuses.CANCELLED);
        finalizationRequests.saveAndFlush(request);
    }

    // Pending requests aimed at the caller, newest first, paged because inbound demand is unbounded.
    @Transactional(readOnly = true)
    public Page<FinalizationRequestDto> myRequests(UUID callerId, Pageable pageable) {
        Page<FinalizationRequest> rows =
                finalizationRequests.findPendingByCounterparty(callerId, pageable);
        if (rows.isEmpty()) {
            return new PageImpl<>(List.of(), rows.getPageable(), rows.getTotalElements());
        }

        // Batch load all participant users.
        List<UUID> userIds = rows.getContent().stream()
                .flatMap(r -> Stream.of(r.getInitiatorId(), r.getCounterpartyId()))
                .distinct()
                .toList();
        Map<UUID, User> userMap = users.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        // Keyed by user id: counterparty mobiles are masked, so a badge cannot be looked up by number.
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

    // One transaction: accept this request, decline its siblings, close the deal; any failure rolls back all.
    @Transactional
    public void accept(UUID callerId, UUID requestId) {
        FinalizationRequest request = finalizationRequests.findById(requestId)
                .orElseThrow(() -> NotFoundException.of("Finalization request"));

        // Scoping: caller must be a participant.
        if (!callerId.equals(request.getInitiatorId())
                && !callerId.equals(request.getCounterpartyId())) {
            throw NotFoundException.of("Finalization request");
        }

        // The initiator must NOT be able to accept their own request.
        if (callerId.equals(request.getInitiatorId())) {
            throw new ForbiddenException(
                    "The initiator cannot accept their own finalization request");
        }

        if (!FinalizationStatuses.canTransition(request.getStatus(), FinalizationStatuses.ACCEPTED)) {
            throw new ConflictException("Cannot accept a request in status " + request.getStatus());
        }

        // Closing first means a failure leaves the request statuses untouched.
        User initiator = users.findById(request.getInitiatorId()).orElse(null);
        String initiatorMobile = initiator != null ? initiator.getMobile() : null;
        dealService.closeForFinalization(
                request.getCounterpartyId(),
                request.getPropertyId(),
                request.getAgreedPrice(),
                initiatorMobile,
                request.getInitiatorId());

        // 2. Accept this request.
        request.setStatus(FinalizationStatuses.ACCEPTED);
        finalizationRequests.saveAndFlush(request);

        // 3. Auto-decline all other pending requests on the same property.
        finalizationRequests.declineSiblings(request.getPropertyId(), request.getId());
    }

    @Transactional
    public void decline(UUID callerId, UUID requestId) {
        FinalizationRequest request = finalizationRequests.findById(requestId)
                .orElseThrow(() -> NotFoundException.of("Finalization request"));

        // Scoping: caller must be a participant.
        if (!callerId.equals(request.getInitiatorId())
                && !callerId.equals(request.getCounterpartyId())) {
            throw NotFoundException.of("Finalization request");
        }

        // The initiator must NOT be able to decline (they should cancel instead).
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

    // ---- internal helpers ----

    private Map<UUID, User> batchLoadUsers(UUID... ids) {
        return users.findAllById(List.of(ids)).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
    }

    // By user id: the party mobile is masked, so matching it against the verified list can never hit.
    private Set<UUID> verifiedAmong(FinalizationRequest request) {
        return tenantProfiles.verifiedAmong(
                List.of(request.getInitiatorId(), request.getCounterpartyId()));
    }
}

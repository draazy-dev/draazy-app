package com.draazy.api.services.request;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceRequestIdentityService {
    private static final Logger log = LoggerFactory.getLogger(ServiceRequestIdentityService.class);


    static final String PURGED = "identities.purged";
    static final String RERECORDED = "identities.recorded";
    private static final Set<String> IDENTITY_EVENTS = Set.of(PURGED, RERECORDED);

    private final ServiceRequestIdentityRepository identities;
    private final ServiceRequestRepository requests;
    private final ServiceRequestPartyRepository parties;
    private final ServiceRequestEventRepository events;
    private final AuditService audit;
    private final AccountPermissions accountPermissions;
    private final RentAgreementOwnerSide ownerSide;
    private final RentAgreementReadiness readiness;

    public ServiceRequestIdentityService(ServiceRequestIdentityRepository identities,
            ServiceRequestRepository requests, ServiceRequestPartyRepository parties,
            ServiceRequestEventRepository events, AuditService audit,
            AccountPermissions accountPermissions, RentAgreementOwnerSide ownerSide,
            RentAgreementReadiness readiness) {
        this.identities = identities;
        this.requests = requests;
        this.parties = parties;
        this.events = events;
        this.audit = audit;
        this.accountPermissions = accountPermissions;
        this.ownerSide = ownerSide;
        this.readiness = readiness;
    }

    @Transactional
    public void replace(AuthPrincipal caller, String id, ServiceRequestIdentitiesRequest body) {
        ServiceRequest request = Ids.parseUuid(id).flatMap(requests::findByIdForUpdate).orElseThrow(() -> NotFoundException.of("Service request"));
        if (request.getStatus().isTerminal()) {
            throw new ConflictException("This request is " + request.getStatus()
                    + " — identity numbers cannot be recorded against it.");
        }
        boolean afterPurge = latestIdentityEventIsPurge(request.getId());
        Set<Slot> replaceSlots = slotsToReplace(caller, request, body.parties(), afterPurge);
        validateDistinctNumbers(body.parties());

        deleteSlots(request.getId(), replaceSlots);
        identities.flush();
        identities.saveAll(body.parties().stream().map(party -> new ServiceRequestIdentity(request.getId(), party.partyRole(),
                        party.partyIndex(), party.normalisedName(), party.normalisedPan(),
                        party.normalisedAadhaar())).toList());
        identities.flush();
        validateDistinctNumbers(identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(
                request.getId()));

        if (afterPurge && caller.userId().equals(request.getRequesterId())) {
            events.save(new ServiceRequestEvent(request.getId(), RERECORDED, null));
        }
        // Audit counts only; identity numbers in audit_log would create a second secret store.
        audit.record(caller, "service-request.identities-recorded", "service_request",
                request.getId().toString(), "parties", body.parties().size());
    }

    private boolean latestIdentityEventIsPurge(UUID requestId) {
        return events.findFirstByRequestIdAndEventInOrderByAtDesc(requestId, IDENTITY_EVENTS).map(e -> PURGED.equals(e.getEvent())).orElse(false);
    }

    @Transactional(readOnly = true)
    public List<ServiceRequestIdentityDto> forAssignee(AuthPrincipal caller, String id) {
        ServiceRequest request = ServiceDeskAuthority.onCallersDesk(caller,
                Ids.parseUuid(id).flatMap(requests::findById)
                        .orElseThrow(() -> NotFoundException.of("Service request")),
                accountPermissions.desksFor(caller));
        UUID assignee = request.getAssigneeId();
        if (assignee == null || !assignee.equals(caller.userId())) {
            audit.record(caller, "service-request.identities-refused", "service_request",
                    request.getId().toString(),
                    "assignee", assignee == null ? null : assignee.toString());
            log.warn("Identity read refused on service request {} for {}: assigned to {}",
                    request.getId(), caller.userId(), assignee);
            throw new ForbiddenException(assignee == null
                    ? "This request is not assigned to anyone yet. Take it first — identity numbers "
                            + "are visible only to the person working the matter."
                    : "This request is assigned to somebody else. Identity numbers are visible only "
                            + "to the person working the matter.");
        }

        List<ServiceRequestIdentity> rows =
                identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(request.getId());
        audit.record(caller, "service-request.identities-viewed", "service_request",
                request.getId().toString(), "parties", rows.size());
        return rows.stream().map(ServiceRequestIdentityDto::of).toList();
    }

    @Transactional(readOnly = true)
    public List<MaskedIdentityDto> maskedForParty(AuthPrincipal caller, String id) {
        ServiceRequest request = Ids.parseUuid(id).flatMap(requests::findById)
                .orElseThrow(() -> NotFoundException.of("Service request"));
        if (!caller.userId().equals(request.getRequesterId())
                && acceptedRoles(request.getId(), caller.userId()).isEmpty()) {
            throw NotFoundException.of("Service request");
        }
        return identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(request.getId()).stream()
                .filter(ServiceRequestIdentity::isHeld)
                .map(MaskedIdentityDto::of)
                .toList();
    }

    @Transactional
    public int purgeFor(UUID serviceRequestId) {
        List<ServiceRequestIdentity> rows =
                identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(serviceRequestId);
        int purged = 0;
        for (ServiceRequestIdentity row : rows) {
            if (row.purge()) {
                purged++;
            }
        }
        if (purged > 0) {
            log.info("Discarded identity numbers for {} parties on service request {}", purged,
                    serviceRequestId);
        }
        return purged;
    }

    Set<String> acceptedRoles(UUID requestId, UUID userId) {
        return parties.findByRequestId(requestId).stream().filter(p -> userId.equals(p.getUserId()) && CoFillParties.ACCEPTED.equals(p.getStatus())).map(ServiceRequestParty::getRole).collect(Collectors.toSet());
    }

    private Set<Slot> acceptedSlots(UUID requestId, UUID userId) {
        return parties.findByRequestId(requestId).stream().filter(p -> userId.equals(p.getUserId()) && CoFillParties.ACCEPTED.equals(p.getStatus())).map(p -> new Slot(p.getRole(), p.getPartyIndex())).collect(Collectors.toSet());
    }

    private Set<Slot> acceptedCoFillSlots(UUID requestId) {
        return parties.findByRequestId(requestId).stream().filter(p -> CoFillParties.ACCEPTED.equals(p.getStatus())).map(p -> new Slot(p.getRole(), p.getPartyIndex())).collect(Collectors.toSet());
    }

    boolean hasAcceptedSlot(UUID requestId, UUID userId, String role, int index) {
        return parties.findByRequestId(requestId).stream().anyMatch(p -> userId.equals(p.getUserId())
                        && CoFillParties.ACCEPTED.equals(p.getStatus())
                        && role.equals(p.getRole())
                        && index == p.getPartyIndex());
    }

    boolean hasLiveCoFillSlot(UUID requestId, String role, int index) {
        return parties.findByRequestId(requestId).stream().anyMatch(p -> !CoFillParties.DECLINED.equals(p.getStatus())
                        && role.equals(p.getRole())
                        && index == p.getPartyIndex());
    }

    private Set<Slot> slotsToReplace(AuthPrincipal caller, ServiceRequest request,
            List<ServiceRequestIdentitiesRequest.Party> body, boolean afterPurge) {
        Set<Slot> bodySlots = slots(body);
        if (!caller.userId().equals(request.getRequesterId())) {
            Set<Slot> own = acceptedSlots(request.getId(), caller.userId());
            if (own.isEmpty()) {
                if (Roles.isBackOffice(caller.role())) {
                    throw new ForbiddenException(
                            "Only the parties to this agreement can record their identity numbers.");
                }
                throw NotFoundException.of("Service request");
            }
            if (!own.containsAll(bodySlots)) {
                throw new ForbiddenException(
                        "You can record identity numbers only for your own side of this agreement.");
            }
            boolean editable = bodySlots.stream().map(Slot::role).distinct()
                    .allMatch(role -> readiness.sideEditable(request, false, role));
            if (!editable && !purgedSlots(request.getId()).containsAll(bodySlots)) {
                throw RentAgreementReadiness.editLocked(request);
            }
            return bodySlots;
        }
        boolean rentAgreement = ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType());
        if (rentAgreement && !afterPurge && !readiness.sideEditable(request, true, null)) {
            throw RentAgreementReadiness.editLocked(request);
        }
        boolean ownsOwnerSide = !rentAgreement || ownerSide.requesterIsOwner(request);
        if (!ownsOwnerSide && bodySlots.stream().anyMatch(slot -> "owner".equals(slot.role()))) {
            throw RentAgreementOwnerSide.refusal();
        }
        Set<Slot> coFillSlots = acceptedCoFillSlots(request.getId()).stream()
                .filter(slot -> !(rentAgreement && "tenant".equals(slot.role())
                        && RentAgreementReadiness.ownerHoldsAll(request)))
                .collect(Collectors.toSet());
        if (bodySlots.stream().anyMatch(coFillSlots::contains)) {
            throw new ConflictException("the invited party records their own identity numbers");
        }
        Map<String, String> onForm = rentAgreement ? formParties(request) : Map.of();
        return identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(request.getId()).stream()
                .filter(row -> bodySlots.contains(new Slot(row.getPartyRole(), row.getPartyIndex()))
                        || !samePerson(onForm.get(row.getPartyRole() + "-" + row.getPartyIndex()), row.getPartyName()))
                .map(row -> new Slot(row.getPartyRole(), row.getPartyIndex()))
                .filter(slot -> !coFillSlots.contains(slot) && (ownsOwnerSide || !"owner".equals(slot.role())))
                .collect(Collectors.toSet());
    }

    private static boolean samePerson(String onForm, String recorded) {
        String a = onForm == null ? "" : onForm.trim().replaceAll("\\s+", " ");
        return !a.isEmpty() && recorded != null && a.equalsIgnoreCase(recorded.trim().replaceAll("\\s+", " "));
    }

    static Map<String, String> formParties(ServiceRequest request) {
        Map<String, Object> state = ServiceRequestPricing.childObject(request.getDetails() == null ? Map.of() : request.getDetails(), "_state");
        Map<String, String> slots = new HashMap<>();
        slots.put("owner-0", text(ServiceRequestPricing.childObject(state, "owner").get("oName")));
        slots.put("tenant-0", "");
        List<?> coOwners = state.get("coOwners") instanceof List<?> rows ? rows : List.of();
        List<?> tenants = state.get("tenants") instanceof List<?> rows ? rows : List.of();
        IntStream.range(0, coOwners.size()).forEach(i -> slots.put("owner-" + (i + 1), name(coOwners.get(i))));
        IntStream.range(0, tenants.size()).forEach(i -> slots.put("tenant-" + i, name(tenants.get(i))));
        return slots;
    }

    private static String name(Object row) {
        return row instanceof Map<?, ?> map ? text(map.get("name")) : "";
    }

    private static String text(Object value) {
        return value == null ? "" : value.toString();
    }

    private Set<Slot> purgedSlots(UUID requestId) {
        return identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(requestId).stream().filter(row -> row.getPurgedAt() != null).map(row -> new Slot(row.getPartyRole(), row.getPartyIndex())).collect(Collectors.toSet());
    }

    private void deleteSlots(UUID requestId, Set<Slot> slots) {
        slots.stream().collect(Collectors.groupingBy(Slot::role,
                        Collectors.mapping(Slot::index, Collectors.toSet()))).forEach((role, indexes) ->
                        identities.deleteByServiceRequestIdAndPartyRoleAndPartyIndexIn(
                                requestId, role, indexes));
    }

    private static Set<Slot> slots(List<ServiceRequestIdentitiesRequest.Party> parties) {
        return parties.stream().map(p -> new Slot(p.partyRole(), p.partyIndex())).collect(Collectors.toSet());
    }

    private record Slot(String role, int index) {
    }

    static void validateDistinctNumbers(Collection<?> rows) {
        Set<String> aadhaars = new HashSet<>();
        Set<String> pans = new HashSet<>();
        for (Object row : rows) {
            String aadhaar = null;
            String pan = null;
            if (row instanceof ServiceRequestIdentitiesRequest.Party party) {
                aadhaar = party.normalisedAadhaar();
                pan = party.normalisedPan();
            } else if (row instanceof ServiceRequestIdentity identity) {
                aadhaar = blankToNull(identity.getAadhaar());
                pan = blankToNull(identity.getPan());
            }
            if (aadhaar != null && !aadhaars.add(aadhaar)) {
                throw new ValidationException("the same Aadhaar number is recorded for two parties");
            }
            if (pan != null && !pans.add(pan.toUpperCase(java.util.Locale.ROOT))) {
                throw new ValidationException("the same PAN is recorded for two parties");
            }
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

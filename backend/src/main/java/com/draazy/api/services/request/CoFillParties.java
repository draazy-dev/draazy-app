package com.draazy.api.services.request;

import com.draazy.api.common.audit.AuditLogRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.validation.Formats;
import com.draazy.api.common.web.Ids;
import com.draazy.api.documents.vault.DocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class CoFillParties {
    static final Set<String> ROLES = Set.of("owner", "tenant");

    static final String INVITED = "invited";
    static final String ACCEPTED = "accepted";
    static final String DECLINED = "declined";

    static final Duration PENDING_INVITE_TTL = Duration.ofDays(90);

    static Stream<ServiceRequestParty> joined(List<ServiceRequestParty> all) {
        return all.stream().filter(p -> p.getUserId() != null && ACCEPTED.equals(p.getStatus()));
    }

    static Set<UUID> customers(ServiceRequest request, List<ServiceRequestParty> all) {
        Set<UUID> to = new LinkedHashSet<>();
        to.add(request.getRequesterId());
        joined(all).forEach(p -> to.add(p.getUserId()));
        return to;
    }

    private final ServiceRequestPartyRepository parties;
    private final ServiceRequestRepository requests;
    private final DocumentRepository documents;
    private final UserRepository users;
    private final AuditService audit;
    private final Notifier notifier;
    private final AuditLogRepository auditLog;
    private final RentAgreementOwnerTakeover takeover;
    private final CoFillInviteWhatsApp whatsApp;

    CoFillParties(ServiceRequestPartyRepository parties,
            ServiceRequestRepository requests,
            DocumentRepository documents,
            UserRepository users,
            AuditService audit,
            Notifier notifier,
            AuditLogRepository auditLog,
            RentAgreementOwnerTakeover takeover,
            CoFillInviteWhatsApp whatsApp) {
        this.parties = parties;
        this.requests = requests;
        this.documents = documents;
        this.users = users;
        this.audit = audit;
        this.notifier = notifier;
        this.auditLog = auditLog;
        this.takeover = takeover;
        this.whatsApp = whatsApp;
    }

    @Transactional
    ServiceRequestPartyDto invite(AuthPrincipal caller, String requestId, String role, int partyIndex,
            String mobile) {
        ServiceRequest request = Ids.parseUuid(requestId).flatMap(requests::findById).orElseThrow(() -> NotFoundException.of("Service request"));
        if (!caller.userId().equals(request.getRequesterId())) {
            throw NotFoundException.of("Service request");
        }
        String side = role == null ? "" : role.trim().toLowerCase();
        if (!ROLES.contains(side)) {
            throw new BadRequestException("role must be one of " + ROLES.stream().sorted().toList());
        }
        if (partyIndex < 0) {
            throw new BadRequestException("partyIndex must not be negative");
        }
        if (request.getStatus().isTerminal()) {
            throw new ConflictException("This request is " + request.getStatus()
                    + " — there is nothing left for a second party to fill.");
        }
        String normalised = MobileMask.normalise(mobile);
        if (normalised == null) {
            throw new BadRequestException(Formats.MOBILE_MESSAGE);
        }
        User invitee = users.findByMobileAndArchivedFalse(normalised).orElse(null);
        if (invitee == null) {
            return inviteByMobile(caller, request, side, partyIndex, normalised);
        }
        if (invitee.getId().equals(request.getRequesterId())) {
            throw new ConflictException("You are already on this request — invite the other party.");
        }
        if (parties.existsByRequestIdAndUserId(request.getId(), invitee.getId())) {
            throw new ConflictException("That person is already a party to this request.");
        }
        if (parties.existsByRequestIdAndRoleAndPartyIndex(request.getId(), side, partyIndex)) {
            throw new ConflictException("That tenant row already has an invitation.");
        }

        if (auditLog.existsByActorAndActionAndEntityId(invitee.getId().toString(),
                "service-request.party-" + DECLINED, request.getId().toString())) {
            throw new ConflictException("That person has declined this request — invite someone else.");
        }
        purgeSlotIdentityScans(request.getId(), side, partyIndex);
        ServiceRequestParty saved = parties.saveAndFlush(
                new ServiceRequestParty(request.getId(), invitee.getId(), side, partyIndex, caller.userId()));
        audit.record(caller, "service-request.party-invited", "service_request",
                request.getId().toString(), "role", side, "party", invitee.getId().toString());
        notifyInvitee(request, saved, invitee.getId(), side);
        String inviterName = displayName(caller.userId());
        whatsApp.send(request, saved, normalised, inviterName);
        return toDto(saved, request.getType(), invitee.getName(), inviterName);
    }

    private void notifyInvitee(ServiceRequest request, ServiceRequestParty saved, UUID inviteeId,
            String side) {
        notifier.notify(inviteeId, "service.party-invited",
                "You were added as the " + side,
                "Complete your details so this request can move forward.",
                ServiceRequestTypes.pageFor(request.getType())
                        + "?party=" + saved.getId()
                        + "&request=" + request.getId());
    }

    private ServiceRequestPartyDto inviteByMobile(AuthPrincipal caller, ServiceRequest request,
            String side, int partyIndex, String normalised) {
        if (parties.existsByRequestIdAndMobile(request.getId(), normalised)) {
            throw new ConflictException("That number has already been invited to this request.");
        }
        if (parties.existsByRequestIdAndRoleAndPartyIndex(request.getId(), side, partyIndex)) {
            throw new ConflictException("That tenant row already has an invitation.");
        }
        purgeSlotIdentityScans(request.getId(), side, partyIndex);
        ServiceRequestParty saved = parties.saveAndFlush(new ServiceRequestParty(
                request.getId(), normalised, Instant.now().plus(PENDING_INVITE_TTL), side,
                partyIndex, caller.userId()));
        audit.record(caller, "service-request.party-invited", "service_request",
                request.getId().toString(), "role", side, "party", MobileMask.mask(normalised));
        String inviterName = displayName(caller.userId());
        whatsApp.send(request, saved, normalised, inviterName);
        return toDto(saved, request.getType(), null, inviterName);
    }

    private void purgeSlotIdentityScans(UUID requestId, String side, int partyIndex) {
        var stale = documents.findByServiceRequestIdOrderByUploadedAtDesc(requestId).stream().filter(document -> RentAgreementReadiness.isIdentityScanFor(document.getCategory(), side, partyIndex)).toList();
        documents.deleteAll(stale);
    }

    @Transactional
    void claimPendingFor(AuthPrincipal caller) {
        User self = users.findById(caller.userId()).orElse(null);
        if (self == null || self.getMobile() == null) {
            return;
        }
        List<ServiceRequestParty> waiting = parties.findByMobile(self.getMobile());
        if (waiting.isEmpty()) {
            return;
        }
        Instant now = Instant.now();
        for (ServiceRequestParty party : waiting) {
            if (party.getInviteExpiresAt() != null && party.getInviteExpiresAt().isBefore(now)) {
                continue;
            }

            boolean wouldDuplicate = parties.existsByRequestIdAndUserId(party.getRequestId(),
                    caller.userId())
                    || requests.findById(party.getRequestId()).map(r -> caller.userId().equals(r.getRequesterId())).orElse(true);
            if (wouldDuplicate) {
                parties.delete(party);
                continue;
            }
            party.claim(caller.userId());
            parties.save(party);
            audit.record(caller, "service-request.party-claimed", "service_request",
                    party.getRequestId().toString(), "role", party.getRole());
        }
        parties.flush();
    }

    @Transactional
    void withdraw(AuthPrincipal caller, String requestId, String partyId) {
        ServiceRequest request = Ids.parseUuid(requestId).flatMap(requests::findById).orElseThrow(() -> NotFoundException.of("Service request"));
        if (!caller.userId().equals(request.getRequesterId())) {
            throw NotFoundException.of("Service request");
        }
        if (request.getStatus().isTerminal()) {
            throw new ConflictException("This request is " + request.getStatus()
                    + " — its parties are part of the record now.");
        }
        ServiceRequestParty party = Ids.parseUuid(partyId).flatMap(parties::findById).filter(p -> p.getRequestId().equals(request.getId())).orElseThrow(() -> NotFoundException.of("Invitation"));
        if (ACCEPTED.equals(party.getStatus())) {
            throw new ConflictException("That invitation has already been accepted"
                    + " — it can no longer be withdrawn.");
        }
        parties.delete(party);
        parties.flush();
        audit.record(caller, "service-request.party-withdrawn", "service_request",
                request.getId().toString(), "role", party.getRole(), "status", party.getStatus(),
                "party", String.valueOf(party.getUserId()));
    }

    @Transactional(readOnly = true)
    List<ServiceRequestPartyDto> myInvites(AuthPrincipal caller) {
        List<ServiceRequestParty> pending =
                parties.findByUserIdAndStatusOrderByCreatedAtDesc(caller.userId(), INVITED);
        if (pending.isEmpty()) {
            return List.of();
        }
        Map<UUID, String> types = new HashMap<>();
        requests.findAllById(pending.stream().map(ServiceRequestParty::getRequestId).toList()).forEach(r -> types.put(r.getId(), r.getType()));
        Map<UUID, String> names = names(pending);
        return pending.stream().map(p -> toDto(p, types.get(p.getRequestId()),
                        names.get(p.getUserId()), names.get(p.getInvitedBy()))).toList();
    }

    // Only the invitee may accept: acceptance grants agreement access, and staff or requester
    // acceptance would break maker-checker separation.
    @Transactional
    ServiceRequestPartyDto decide(AuthPrincipal caller, String partyId, String decision) {
        ServiceRequestParty party = Ids.parseUuid(partyId).flatMap(parties::findById).orElseThrow(() -> NotFoundException.of("Invitation"));
        if (!caller.userId().equals(party.getUserId())) {
            throw NotFoundException.of("Invitation");
        }
        String outcome = switch (decision == null ? "" : decision.trim().toLowerCase()) {
            case "accept" -> ACCEPTED;
            case "decline" -> DECLINED;
            default -> throw new BadRequestException("decision must be 'accept' or 'decline'");
        };
        if (!INVITED.equals(party.getStatus())) {
            throw new ConflictException("You have already " + party.getStatus() + " this invitation.");
        }
        ServiceRequest request = requests.findById(party.getRequestId()).orElseThrow(() -> NotFoundException.of("Invitation"));
        boolean takeOver = ACCEPTED.equals(outcome) && RentAgreementOwnerTakeover.applies(request, party);
        if (takeOver) {
            takeover.refuseIfBlocked(request, caller.userId());
        }
        party.answer(outcome);
        parties.saveAndFlush(party);
        audit.record(caller, "service-request.party-" + outcome, "service_request",
                party.getRequestId().toString(), "role", party.getRole());
        Map<UUID, String> names = names(List.of(party));
        ServiceRequestPartyDto answered = toDto(party, request.getType(), names.get(party.getUserId()),
                names.get(party.getInvitedBy()));
        if (takeOver) {
            takeover.takeOver(request, party);
            audit.record(caller, "service-request.owner-took-over", "service_request",
                    request.getId().toString());
        }
        return answered;
    }

    void announcePaid(ServiceRequest request) {
        UUID payer = request.payer();
        Set<UUID> others = new LinkedHashSet<>();
        others.add(request.getRequesterId());
        joined(parties.findByRequestId(request.getId())).forEach(p -> others.add(p.getUserId()));
        others.remove(payer);
        String who = users.findById(payer).map(User::getName).filter(name -> !name.isBlank()).orElse("The other side");
        others.forEach(person -> notifier.notify(person, "service.party-paid", who + " has paid for the agreement",
                "Nothing more to pay. Our team will now prepare the draft.",
                ServiceRequestTypes.pageFor(request.getType())));
    }

    static ServiceRequestPartyDto toDto(ServiceRequestParty party, String requestType,
            String partyName, String invitedByName) {
        return new ServiceRequestPartyDto(
                party.getId().toString(),
                party.getRequestId().toString(),
                requestType,
                party.getRole(),
                party.getPartyIndex(),
                party.getStatus(),
                partyName,
                MobileMask.mask(party.getMobile()),
                party.isPending(),
                invitedByName,
                party.getCreatedAt());
    }

    private Map<UUID, String> names(List<ServiceRequestParty> rows) {
        Set<UUID> ids = new LinkedHashSet<>();
        rows.forEach(p -> {
            ids.add(p.getUserId());
            ids.add(p.getInvitedBy());
        });
        ids.removeIf(Objects::isNull);
        Map<UUID, String> names = new HashMap<>();
        users.findAllById(ids).forEach(u -> names.put(u.getId(), u.getName()));
        return names;
    }

    private String displayName(UUID userId) {
        return users.findById(userId).map(User::getName).orElse(null);
    }
}

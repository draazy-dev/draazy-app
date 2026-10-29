package com.draazy.api.services.request;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.security.AuthPrincipal;
import java.time.Instant;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class ServiceRequestAttention {
    static final int REASON_MAX = 500;
    static final int PAPERS_MAX = 10;
    private static final String DESK_LINK = "/ops/drafting-desk";

    private static final Set<ServiceRequestStatus> ASKABLE = EnumSet.of(ServiceRequestStatus.ASSIGNED,
            ServiceRequestStatus.IN_PROGRESS, ServiceRequestStatus.CHANGES_REQUESTED);

    private final ServiceRequestService requests;
    private final ServiceRequestRepository requestRows;
    private final ServiceRequestPartyRepository parties;
    private final ServiceRequestMessageRepository messages;
    private final ServiceRequestMapper mapper;
    private final UserRepository users;
    private final AuditService audit;
    private final Notifier notifier;
    private final DecisionMessenger messenger;

    public ServiceRequestAttention(ServiceRequestService requests, ServiceRequestRepository requestRows,
            ServiceRequestPartyRepository parties, ServiceRequestMessageRepository messages,
            ServiceRequestMapper mapper, UserRepository users, AuditService audit, Notifier notifier,
            DecisionMessenger messenger) {
        this.requests = requests;
        this.requestRows = requestRows;
        this.parties = parties;
        this.messages = messages;
        this.mapper = mapper;
        this.users = users;
        this.audit = audit;
        this.notifier = notifier;
        this.messenger = messenger;
    }

    @Transactional
    public ServiceRequestDto ask(AuthPrincipal caller, String id, String party, String reason, List<String> paperIds) {
        ServiceRequest request = requests.opsAccessibleForUpdate(caller, id);
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            throw new ConflictException("Only a rent agreement is sent back to the customer for a correction.");
        }
        requests.requireHolder(caller, request, "sending it back to the customer", "it is theirs to send back");
        if (!ASKABLE.contains(request.getStatus())) {
            throw new ConflictException("A case is sent back for a correction while the desk is working it; this one is "
                    + request.getStatus() + ".");
        }
        String side = party == null ? "" : party.strip();
        if (!CoFillParties.ROLES.contains(side)) {
            throw new ValidationException("party must be one of " + CoFillParties.ROLES.stream().sorted().toList());
        }
        List<Map<String, String>> papers = papers(request, side, paperIds);
        String why = reason == null ? "" : reason.strip();
        if ((why.isEmpty() && papers.isEmpty()) || why.length() > REASON_MAX) {
            throw new ValidationException("Tick the papers to re-upload or ask a question, in at most " + REASON_MAX
                    + " characters \u2014 the customer works from it.");
        }
        List<String> paperNames = papers.stream().map(p -> p.get("name")).toList();
        String told = why.isEmpty() ? "Please upload a new copy of: " + String.join(", ", paperNames)
                : papers.isEmpty() ? why : why + "\n\nPlease upload a new copy of: " + String.join(", ", paperNames);
        Set<UUID> recipients = recipients(request, side);
        requests.transition(request, ServiceRequestStatus.ACTION_REQUIRED);
        Map<String, Object> attention = new LinkedHashMap<>();
        attention.put("party", side);
        attention.put("reason", why);
        attention.put("papers", papers);
        attention.put("askedAt", Instant.now().toString());
        attention.put("recipients", recipients.stream().map(UUID::toString).toList());
        request.askAttention(attention);
        messages.save(new ServiceRequestMessage(request.getId(), caller.userId(), caller.role(), told));
        requests.record(request, "status." + ServiceRequestStatus.ACTION_REQUIRED,
                requests.displayName(caller.userId()));
        audit.record(caller, "service-request.attention-asked", "service_request", request.getId().toString(),
                "party", side, "reason", why, "papers", String.join(", ", paperNames));
        recipients.forEach(user -> {
            notifier.notify(user, "service.action-required", "Your rent agreement needs your attention", told,
                    ServiceRequestTypes.pageFor(request.getType()));
            if (notifier.allowsWhatsapp(user)) {
                users.findById(user).map(User::getMobile)
                        .ifPresent(mobile -> afterCommit(() -> messenger.sendServiceAttention(mobile, "rent agreement")));
            }
        });
        return mapper.toDto(request, caller);
    }

    @Transactional
    public ServiceRequestDto resolve(AuthPrincipal caller, String id, String note) {
        ServiceRequest request = requests.visibleForUpdate(caller, id);
        if (!requestRows.isParticipant(request.getId(), caller.userId())) {
            throw NotFoundException.of("Service request");
        }
        Map<String, Object> asked = request.getAttention();
        boolean askedOfCaller = asked == null || !(asked.get("recipients") instanceof List<?> to)
                || to.contains(caller.userId().toString());
        if (request.getStatus() != ServiceRequestStatus.ACTION_REQUIRED || !askedOfCaller) {
            throw new ConflictException("Nothing on this request is waiting on you.");
        }
        String said = note == null ? "" : note.strip();
        if (said.length() > REASON_MAX) {
            throw new ValidationException("Keep the note to at most " + REASON_MAX + " characters.");
        }
        requireFreshCopies(request, caller, asked);
        requests.transition(request, ServiceRequestStatus.IN_PROGRESS);
        if (!said.isEmpty()) {
            messages.save(new ServiceRequestMessage(request.getId(), caller.userId(), caller.role(), said));
        }
        requests.recordBy(request, "attention.resolved", caller.userId());
        audit.record(caller, "service-request.attention-resolved", "service_request", request.getId().toString(),
                "note", said.isEmpty() ? null : said);
        if (request.getAssigneeId() != null) {
            notifier.notify(request.getAssigneeId(), "service.attention-resolved", "Customer sent the case back",
                    said.isEmpty() ? "The correction you asked for is done. Check it and carry on." : said, DESK_LINK);
        }
        return mapper.toDto(request, caller);
    }

    private static List<Map<String, String>> papers(ServiceRequest request, String side, List<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        Map<String, String> checklist = ServiceRequestChecklist.itemsFor(request);
        List<String> cleaned = ids.stream().map(RentAgreementReadiness::canonical).filter(i -> !i.isEmpty()).distinct().toList();
        if (cleaned.size() > PAPERS_MAX) {
            throw new ValidationException("Tick at most " + PAPERS_MAX + " papers.");
        }
        return cleaned.stream().map(paper -> {
            if (!checklist.containsKey(paper) || !side.equals(RentAgreementReadiness.sideOf(paper))) {
                throw new ValidationException("'" + paper + "' is not one of the " + side + "'s papers on this agreement.");
            }
            return Map.of("id", paper, "name", checklist.get(paper));
        }).toList();
    }

    private void requireFreshCopies(ServiceRequest request, AuthPrincipal caller, Map<String, Object> asked) {
        if (asked == null || !(asked.get("papers") instanceof List<?> papers) || papers.isEmpty()) {
            return;
        }
        Instant askedAt = Instant.parse(String.valueOf(asked.get("askedAt")));
        Set<String> fresh = mapper.toDto(request, caller).documents().stream()
                .filter(d -> d.uploadedAt() != null && d.uploadedAt().isAfter(askedAt))
                .map(d -> RentAgreementReadiness.canonical(d.category())).collect(Collectors.toSet());
        List<String> missing = papers.stream().filter(Map.class::isInstance).map(Map.class::cast)
                .filter(p -> !fresh.contains(String.valueOf(p.get("id")))).map(p -> String.valueOf(p.get("name"))).toList();
        if (!missing.isEmpty()) {
            throw new ConflictException("Upload a new copy of " + String.join(", ", missing) + " first.");
        }
    }

    private Set<UUID> recipients(ServiceRequest request, String side) {
        Set<UUID> joined = CoFillParties.joined(parties.findByRequestId(request.getId()))
                .filter(p -> side.equals(p.getRole()))
                .map(ServiceRequestParty::getUserId).collect(Collectors.toCollection(LinkedHashSet::new));
        return joined.isEmpty() ? Set.of(request.getRequesterId()) : joined;
    }

    private static void afterCommit(Runnable send) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            send.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                send.run();
            }
        });
    }
}

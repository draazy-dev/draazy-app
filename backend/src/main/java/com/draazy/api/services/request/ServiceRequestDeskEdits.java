package com.draazy.api.services.request;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.security.AuthPrincipal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceRequestDeskEdits {
    static final int NOTE_MAX = 300;
    private static final int FIELDS_LOGGED = 40;

    private static final Set<ServiceRequestStatus> EDITABLE = EnumSet.of(ServiceRequestStatus.ASSIGNED,
            ServiceRequestStatus.IN_PROGRESS, ServiceRequestStatus.CHANGES_REQUESTED,
            ServiceRequestStatus.ACTION_REQUIRED);

    private final ServiceRequestService requests;
    private final ServiceRequestPartyRepository parties;
    private final ServiceRequestIdentityRepository identities;
    private final ServiceRequestPricing pricing;
    private final ServiceRequestMapper mapper;
    private final AuditService audit;
    private final Notifier notifier;

    public ServiceRequestDeskEdits(ServiceRequestService requests, ServiceRequestPartyRepository parties,
            ServiceRequestIdentityRepository identities, ServiceRequestPricing pricing, ServiceRequestMapper mapper,
            AuditService audit, Notifier notifier) {
        this.requests = requests;
        this.parties = parties;
        this.identities = identities;
        this.pricing = pricing;
        this.mapper = mapper;
        this.audit = audit;
        this.notifier = notifier;
    }

    @Transactional
    public ServiceRequestDto edit(AuthPrincipal caller, String id, Map<String, Object> state, String note) {
        ServiceRequest request = editable(caller, id);
        String why = note == null ? "" : note.strip();
        if (why.length() > NOTE_MAX) {
            throw new ValidationException("Keep the note to at most " + NOTE_MAX + " characters.");
        }
        Map<String, Object> current = request.getDetails() == null ? Map.of() : request.getDetails();
        Map<String, Object> next = pricing.withServerTerms(request.getType(),
                requests.boundedDetails(request.getType(), withState(current, state)));
        Map<String, Object> before = ServiceRequestPricing.childObject(current, "_state");
        Map<String, Object> after = ServiceRequestPricing.childObject(next, "_state");
        if (!ServiceRequestPricing.samePricedTerms(current, next)
                || !ServiceRequestPricing.samePricedTerms(Map.of("_state", before), Map.of("_state", after))) {
            throw new ConflictException("That changes the price (rent, deposit, term, escalation or registration "
                    + "area). Use Revise priced terms so the customer accepts the new price first.");
        }
        LocalDate filedOn = LocalDate.ofInstant(request.getCreatedAt(), PlatformTime.IST);
        RentAgreementDetailsRules.check(next, filedOn, false);
        List<String> changed = new ArrayList<>();
        diff("", before, after, changed);
        if (changed.isEmpty()) {
            throw new ValidationException("Nothing changed.");
        }
        request.replaceDetails(next);
        relabelIdentities(request);
        requests.record(request, "details.edited", requests.displayName(caller.userId()));
        audit.record(caller, "service-request.details-edited", "service_request", request.getId().toString(),
                "fields", String.join(", ", changed.subList(0, Math.min(changed.size(), FIELDS_LOGGED))),
                "count", changed.size(), "note", why.isEmpty() ? null : why);
        String body = (changed.size() == 1 ? "1 detail was" : changed.size() + " details were")
                + " corrected on your rent agreement." + (why.isEmpty() ? "" : " " + why);
        customers(request).forEach(user -> notifier.notify(user, "service.details-edited",
                "Our team updated your rent agreement", body, ServiceRequestTypes.pageFor(request.getType())));
        return mapper.toDto(request, caller);
    }

    @Transactional
    public void correctIdentities(AuthPrincipal caller, String id, List<ServiceRequestIdentitiesRequest.Party> sent) {
        ServiceRequest request = editable(caller, id);
        if (!caller.userId().equals(request.getAssigneeId())) {
            throw new ConflictException("Take this request before correcting its ID numbers.");
        }
        Set<String> onForm = ServiceRequestIdentityService.formParties(request).keySet();
        sent.stream().filter(p -> !onForm.contains(p.partyRole() + "-" + p.partyIndex())).findFirst().ifPresent(p -> {
            throw new ValidationException(p.partyRole() + " " + (p.partyIndex() + 1) + " is not a party on this agreement.");
        });
        Map<String, ServiceRequestIdentity> held = identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(
                request.getId()).stream().collect(Collectors.toMap(ServiceRequestDeskEdits::slot, r -> r));
        List<String> slots = sent.stream().filter(p -> {
            ServiceRequestIdentity was = held.get(p.partyRole() + "-" + p.partyIndex());
            return was == null || !Objects.equals(was.getPan(), p.normalisedPan())
                    || !Objects.equals(was.getAadhaar(), p.normalisedAadhaar());
        }).map(p -> p.partyRole() + "-" + p.partyIndex()).toList();
        if (slots.isEmpty()) {
            throw new ValidationException("Nothing changed.");
        }
        sent.forEach(p -> identities.deleteByServiceRequestIdAndPartyRoleAndPartyIndexIn(request.getId(), p.partyRole(),
                Set.of(p.partyIndex())));
        identities.flush();
        identities.saveAll(sent.stream().map(p -> new ServiceRequestIdentity(request.getId(), p.partyRole(), p.partyIndex(),
                p.normalisedName(), p.normalisedPan(), p.normalisedAadhaar())).toList());
        identities.flush();
        ServiceRequestIdentityService.validateDistinctNumbers(
                identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(request.getId()));
        requests.record(request, "identities.corrected", requests.displayName(caller.userId()));
        audit.record(caller, "service-request.identities-corrected", "service_request", request.getId().toString(),
                "slots", String.join(", ", slots));
        customers(request).forEach(user -> notifier.notify(user, "service.details-edited",
                "Our team updated your rent agreement", "We corrected the PAN / Aadhaar on your rent agreement.",
                ServiceRequestTypes.pageFor(request.getType())));
    }

    private void relabelIdentities(ServiceRequest request) {
        Map<String, String> onForm = ServiceRequestIdentityService.formParties(request);
        List<ServiceRequestIdentity> stale = identities.findByServiceRequestIdOrderByPartyRoleAscPartyIndexAsc(
                request.getId()).stream().filter(row -> {
                    String name = onForm.get(slot(row));
                    return name == null || row.isHeld() && !text(name).equals(Objects.toString(row.getPartyName(), ""));
                }).toList();
        if (stale.isEmpty()) {
            return;
        }
        identities.deleteAll(stale);
        identities.flush();
        identities.saveAll(stale.stream().filter(row -> onForm.containsKey(slot(row))).map(row -> {
            String name = text(onForm.get(slot(row)));
            return new ServiceRequestIdentity(request.getId(), row.getPartyRole(), row.getPartyIndex(),
                    name.isEmpty() ? null : name, row.getPan(), row.getAadhaar());
        }).toList());
    }

    private static String slot(ServiceRequestIdentity row) {
        return row.getPartyRole() + "-" + row.getPartyIndex();
    }

    private ServiceRequest editable(AuthPrincipal caller, String id) {
        ServiceRequest request = requests.opsAccessibleForUpdate(caller, id);
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            throw new ConflictException("Only a rent agreement's form is edited by the desk.");
        }
        requests.requireHolder(caller, request, "editing its details", "the details are theirs to edit");
        if (!EDITABLE.contains(request.getStatus())) {
            throw new ConflictException("The details are edited while the agreement is being drafted; this one is "
                    + request.getStatus() + ".");
        }
        return request;
    }

    private static Map<String, Object> withState(Map<String, Object> current, Map<String, Object> state) {
        if (state == null || state.isEmpty()) {
            throw new ValidationException("Send the agreement's form state to edit it.");
        }
        Map<String, Object> next = new LinkedHashMap<>(current);
        next.put("_state", state);
        Map<String, Object> prop = ServiceRequestPricing.childObject(state, "prop");
        String line = Stream.of("flatNo", "society", "locality", "city").map(k -> text(prop.get(k)))
                .filter(s -> !s.isEmpty()).collect(Collectors.joining(", "));
        if (!line.isEmpty()) {
            next.put("property", line);
        }
        String owner = text(ServiceRequestPricing.childObject(state, "owner").get("oName"));
        if (!owner.isEmpty()) {
            next.put("ownerName", owner);
        }
        String tenants = state.get("tenants") instanceof List<?> rows ? rows.stream()
                .map(row -> row instanceof Map<?, ?> m ? text(m.get("name")) : "").filter(s -> !s.isEmpty())
                .collect(Collectors.joining(", ")) : "";
        if (!tenants.isEmpty()) {
            next.put("tenants", tenants);
        }
        Object start = ServiceRequestPricing.childObject(state, "terms").get("startDate");
        if (start != null) {
            next.put("startDate", start);
        }
        return next;
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).strip();
    }

    private static void diff(String path, Object before, Object after, List<String> out) {
        if (before instanceof Map<?, ?> b && after instanceof Map<?, ?> a) {
            Set<Object> keys = new LinkedHashSet<>(b.keySet());
            keys.addAll(a.keySet());
            keys.forEach(k -> diff(path.isEmpty() ? String.valueOf(k) : path + "." + k, b.get(k), a.get(k), out));
        } else if (before instanceof List<?> b && after instanceof List<?> a) {
            for (int i = 0; i < Math.max(b.size(), a.size()); i++) {
                diff(path + "[" + i + "]", i < b.size() ? b.get(i) : null, i < a.size() ? a.get(i) : null, out);
            }
        } else if (!Objects.equals(blankToNull(before), blankToNull(after))) {
            out.add(path);
        }
    }

    private static Object blankToNull(Object value) {
        return value instanceof String s && s.isBlank() ? null : value;
    }

    private Set<UUID> customers(ServiceRequest request) {
        Set<UUID> to = new LinkedHashSet<>();
        to.add(request.getRequesterId());
        CoFillParties.joined(parties.findByRequestId(request.getId()))
                .forEach(p -> to.add(p.getUserId()));
        return to;
    }
}

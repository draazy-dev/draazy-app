package com.draazy.api.services.request;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.security.AuthPrincipal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RentAgreementDetailsEdits {
    private final ServiceRequestService requests;
    private final ServiceRequestRepository rows;
    private final ServiceRequestPartyRepository parties;
    private final ServiceRequestPricing pricing;
    private final RentAgreementReadiness readiness;
    private final ServiceRequestMapper mapper;
    private final AuditService audit;

    public RentAgreementDetailsEdits(ServiceRequestService requests, ServiceRequestRepository rows,
            ServiceRequestPartyRepository parties, ServiceRequestPricing pricing, RentAgreementReadiness readiness,
            ServiceRequestMapper mapper, AuditService audit) {
        this.requests = requests;
        this.rows = rows;
        this.parties = parties;
        this.pricing = pricing;
        this.readiness = readiness;
        this.mapper = mapper;
        this.audit = audit;
    }

    @Transactional
    public ServiceRequestDto update(AuthPrincipal caller, String id, Map<String, Object> details) {
        ServiceRequest request = requests.visibleForUpdate(caller, id);
        if (!caller.userId().equals(request.getRequesterId())) {
            throw new ForbiddenException("Only the person who filed this agreement can edit its details here.");
        }
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            throw new ConflictException("Only a rent agreement's details are edited after payment.");
        }
        boolean unpaid = request.getStatus() == ServiceRequestStatus.AWAITING_PAYMENT;
        if (!(unpaid || request.getStatus() == ServiceRequestStatus.NEW) || !readiness.sideEditable(request, true, null)) {
            throw RentAgreementReadiness.editLocked(request);
        }
        Map<String, Object> current = request.getDetails() == null ? Map.of() : request.getDetails();
        Map<String, Object> next = pricing.withServerTerms(request.getType(),
                keepInviteeSides(request, current, requests.mergedBoundedDetails(request, details)));
        Map<String, Object> before = Map.of("_state", ServiceRequestPricing.childObject(current, "_state"));
        Map<String, Object> after = Map.of("_state", ServiceRequestPricing.childObject(next, "_state"));
        boolean repriced = !ServiceRequestPricing.samePricedTerms(current, next)
                || !ServiceRequestPricing.samePricedTerms(before, after);
        if (repriced && !unpaid) {
            throw new ConflictException("The fee was priced on the rent, deposit, term and registration area. "
                    + "Message our team to change them.");
        }
        if (repriced && request.getPaymentRef() != null) {
            throw new ConflictException("Checkout was opened on the old fee. Cancel this agreement and start again "
                    + "to change the rent, deposit, term or registration area.");
        }
        RentAgreementDetailsRules.checkMerged(next);
        String flat = ServiceRequestService.openUnpaidFlat(next);
        if (unpaid && !flat.equals(ServiceRequestService.openUnpaidFlat(current))
                && rows.countOpenUnpaidOnFlat(request.getRequesterId(), request.getType(), flat) > 0) {
            throw new ConflictException("You already have an unpaid rent agreement for this flat. Finish or cancel"
                    + " that one instead.");
        }
        request.replaceDetails(next);
        if (repriced) {
            request.awaitPayment(pricing.priceFor(request.getType(), next));
        }
        requests.recordBy(request, "details.updated", caller.userId());
        audit.record(caller, "service-request.details-updated", "service_request", request.getId().toString());
        return mapper.toDto(request, caller);
    }

    private Map<String, Object> keepInviteeSides(ServiceRequest request, Map<String, Object> current,
            Map<String, Object> merged) {
        Map<String, Object> next = new LinkedHashMap<>(merged);
        Map<String, Object> was = ServiceRequestPricing.childObject(current, "_state");
        Map<String, Object> state = new LinkedHashMap<>(ServiceRequestPricing.childObject(merged, "_state"));
        CoFillParties.joined(parties.findByRequestId(request.getId())).forEach(party -> {
            if ("owner".equals(party.getRole())) {
                restore(next, current, "ownerName");
                restore(state, was, "owner");
                restore(state, was, "coOwners");
            } else if ("tenant".equals(party.getRole()) && !RentAgreementReadiness.ownerHoldsAll(request)) {
                state.put("tenants", withRow(state.get("tenants"), was.get("tenants"), party.getPartyIndex()));
            }
        });
        next.put("_state", state);
        return next;
    }

    private static void restore(Map<String, Object> into, Map<String, Object> from, String key) {
        if (from.containsKey(key)) {
            into.put(key, from.get(key));
        } else {
            into.remove(key);
        }
    }

    private static List<Object> withRow(Object sent, Object kept, int index) {
        List<Object> rows = new ArrayList<>(sent instanceof List<?> list ? list : List.of());
        List<?> keptRows = kept instanceof List<?> list ? list : List.of();
        if (index >= keptRows.size()) {
            return rows;
        }
        while (rows.size() <= index) {
            rows.add(Map.of());
        }
        rows.set(index, keptRows.get(index));
        return rows;
    }
}

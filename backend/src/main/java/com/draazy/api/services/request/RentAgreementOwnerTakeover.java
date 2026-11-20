package com.draazy.api.services.request;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

// A tenant-started agreement is the owner's to complete and pay: on accepting, the invited owner
// becomes the requester and the tenant becomes an accepted party whose side is already filled.
@Component
class RentAgreementOwnerTakeover {
    private final ServiceRequestRepository requests;
    private final ServiceRequestPartyRepository parties;
    private final ServiceRequestEventRepository events;
    private final UserRepository users;
    private final Notifier notifier;

    RentAgreementOwnerTakeover(ServiceRequestRepository requests, ServiceRequestPartyRepository parties,
            ServiceRequestEventRepository events, UserRepository users, Notifier notifier) {
        this.requests = requests;
        this.parties = parties;
        this.events = events;
        this.users = users;
        this.notifier = notifier;
    }

    static boolean applies(ServiceRequest request, ServiceRequestParty party) {
        return ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())
                && "owner".equals(party.getRole())
                && request.getStatus() == ServiceRequestStatus.AWAITING_PAYMENT
                && "invite".equals(String.valueOf(state(request).get("ownerMode")));
    }

    void refuseIfBlocked(ServiceRequest request, UUID owner) {
        if (requests.countOpenUnpaidOnFlat(owner, request.getType(),
                ServiceRequestService.openUnpaidFlat(request.getDetails())) > 0) {
            throw blocked();
        }
    }

    private static ConflictException blocked() {
        return new ConflictException("You already have an unpaid rent agreement for this flat. Pay or cancel it"
                + " on the Rent Agreement page, then open this invitation again.");
    }

    void takeOver(ServiceRequest request, ServiceRequestParty ownerParty) {
        UUID tenant = request.getRequesterId();
        UUID owner = ownerParty.getUserId();
        int row = tenantRow(request, tenant);
        if (parties.existsByRequestIdAndRoleAndPartyIndex(request.getId(), "tenant", row)) {
            throw new ConflictException("This agreement's tenant row is already taken. Ask the tenant to start again.");
        }
        parties.delete(ownerParty);
        parties.flush();
        ServiceRequestParty tenantParty = new ServiceRequestParty(request.getId(), tenant, "tenant", row, owner);
        tenantParty.answer(CoFillParties.ACCEPTED);
        tenantParty.markDetailsSubmitted(Instant.now());
        parties.saveAndFlush(tenantParty);

        Map<String, Object> details = new LinkedHashMap<>(request.getDetails());
        Map<String, Object> state = new LinkedHashMap<>(state(request));
        state.put("ownerMode", "fill");
        state.put("tenantMode", "fill");
        details.put("_state", state);
        request.replaceDetails(details);
        request.handOverTo(owner);
        try {
            requests.saveAndFlush(request);
        } catch (DataIntegrityViolationException violation) {
            if (ServiceRequestService.isOpenUnpaidCollision(violation)) {
                throw blocked();
            }
            throw violation;
        }
        events.save(new ServiceRequestEvent(request.getId(), "party.took-over",
                users.findById(owner).map(User::getName).orElse(null)));
        notifier.notify(tenant, "service.owner-took-over",
                "Your owner has the agreement now",
                "They will check the details, add theirs and pay. You can view it any time.",
                ServiceRequestTypes.pageFor(request.getType()));
    }

    private int tenantRow(ServiceRequest request, UUID tenant) {
        String mobile = users.findById(tenant).map(User::getMobile)
                .map(RentAgreementRegistration::validMobile).orElse(null);
        List<?> rows = state(request).get("tenants") instanceof List<?> list ? list : List.of();
        for (int i = 0; mobile != null && i < rows.size(); i++) {
            if (rows.get(i) instanceof Map<?, ?> tenantRow && tenantRow.get("mobile") instanceof String typed
                    && mobile.equals(RentAgreementRegistration.validMobile(typed))) {
                return i;
            }
        }
        return 0;
    }

    private static Map<String, Object> state(ServiceRequest request) {
        return ServiceRequestPricing.childObject(request.getDetails() == null ? Map.of() : request.getDetails(),
                "_state");
    }
}

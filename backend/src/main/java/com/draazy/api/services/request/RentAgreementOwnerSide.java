package com.draazy.api.services.request;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

// Owner-side KYC and identities come from the owner, never from a tenant who raised the request.
@Component
class RentAgreementOwnerSide {

    private final ServiceRequestPartyRepository parties;
    private final PropertyRepository properties;
    private final UserRepository users;

    RentAgreementOwnerSide(ServiceRequestPartyRepository parties, PropertyRepository properties,
            UserRepository users) {
        this.parties = parties;
        this.properties = properties;
        this.users = users;
    }

    static ForbiddenException refusal() {
        return new ForbiddenException(ErrorCodes.OWNER_SIDE_REQUIRES_OWNER,
                "Owner papers and identity numbers are filed by the owner. Invite the owner to fill their part.");
    }

    // A listing settles it: only its owner is the owner side. Without one the request's own
    // record is all there is: the requester's number among the licensors, else an accepted tenant co-fill party.
    boolean requesterIsOwner(ServiceRequest request) {
        if (request.getPropertyId() != null) {
            return properties.findById(request.getPropertyId())
                    .map(property -> request.getRequesterId().equals(property.getOwner().getId())).orElse(false);
        }
        String mobile = users.findById(request.getRequesterId()).map(User::getMobile).map(MobileMask::normalise)
                .orElse(null);
        return mobile != null && licensorMobiles(request).contains(mobile)
                || parties.findByRequestId(request.getId()).stream()
                        .anyMatch(p -> CoFillParties.ACCEPTED.equals(p.getStatus()) && "tenant".equals(p.getRole()));
    }

    // Licensor slots no accepted owner party stands behind.
    List<String> licensorsAwaitingOwner(ServiceRequest request) {
        Set<Integer> represented = parties.findByRequestId(request.getId()).stream()
                .filter(p -> "owner".equals(p.getRole()) && CoFillParties.ACCEPTED.equals(p.getStatus()))
                .map(ServiceRequestParty::getPartyIndex).collect(Collectors.toSet());
        List<String> waiting = new ArrayList<>();
        int licensors = 1 + coOwners(request).size();
        for (int i = 0; i < licensors; i++) {
            if (!represented.contains(i)) {
                waiting.add("Licensor " + (i + 1));
            }
        }
        return waiting;
    }

    private static List<String> licensorMobiles(ServiceRequest request) {
        Map<String, Object> owner = ServiceRequestPricing.childObject(state(request), "owner");
        List<String> mobiles = new ArrayList<>();
        mobiles.add(MobileMask.normalise(String.valueOf(owner.get("oMobile"))));
        coOwners(request).forEach(row -> mobiles.add(MobileMask.normalise(String.valueOf(row.get("mobile")))));
        return mobiles.stream().filter(Objects::nonNull).toList();
    }

    private static List<Map<?, ?>> coOwners(ServiceRequest request) {
        if (!(state(request).get("coOwners") instanceof List<?> rows)) {
            return List.of();
        }
        return rows.stream().filter(Map.class::isInstance).<Map<?, ?>>map(Map.class::cast).toList();
    }

    private static Map<String, Object> state(ServiceRequest request) {
        return ServiceRequestPricing.childObject(request.getDetails() == null ? Map.of() : request.getDetails(),
                "_state");
    }
}

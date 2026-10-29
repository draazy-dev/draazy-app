package com.draazy.api.services.request;

import com.draazy.api.security.AuthPrincipal;
import java.util.UUID;

public final class CheckoutFixture {
    private CheckoutFixture() {
    }

    public static String open(ServiceRequestService service, ServiceRequestRepository repo, UUID id) {
        ServiceRequest request = repo.findById(id).orElseThrow();
        if (request.getPaymentRef() != null) {
            return request.getPaymentRef();
        }
        AuthPrincipal requester = new AuthPrincipal(request.getRequesterId(), "owner", null, true, false);
        String ref = service.openOrderFor(requester, request).orderId();
        request.attachOrder(ref);
        repo.saveAndFlush(request);
        return ref;
    }
}

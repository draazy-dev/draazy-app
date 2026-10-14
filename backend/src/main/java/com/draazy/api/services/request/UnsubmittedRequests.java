package com.draazy.api.services.request;

import com.draazy.api.common.trust.UnsubmittedRequestLookup;
import java.util.Collection;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class UnsubmittedRequests implements UnsubmittedRequestLookup {

    private final ServiceRequestRepository requests;

    UnsubmittedRequests(ServiceRequestRepository requests) {
        this.requests = requests;
    }

    @Override
    @Transactional(readOnly = true)
    public Set<UUID> unsubmitted(Collection<UUID> serviceRequestIds) {
        return requests.findAllById(serviceRequestIds).stream()
                .filter(r -> r.getStatus() == ServiceRequestStatus.AWAITING_PAYMENT)
                .map(ServiceRequest::getId)
                .collect(Collectors.toSet());
    }
}

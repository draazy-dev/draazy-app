package com.draazy.api.services.request;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.documents.vault.DocumentService;
import com.draazy.api.provider.PaymentGateway;
import com.draazy.api.security.AuthPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ServiceRequestDeletion {
    private final ServiceRequestRepository requests;
    private final ServiceRequestEventRepository events;
    private final DocumentService documents;
    private final PaymentGateway gateway;
    private final AuditService audit;

    ServiceRequestDeletion(ServiceRequestRepository requests, ServiceRequestEventRepository events,
            DocumentService documents, PaymentGateway gateway, AuditService audit) {
        this.requests = requests;
        this.events = events;
        this.documents = documents;
        this.gateway = gateway;
        this.audit = audit;
    }

    @Transactional
    public void delete(AuthPrincipal caller, String id) {
        ServiceRequest request = Ids.parseUuid(id)
                .filter(uuid -> requests.isParticipant(uuid, caller.userId()))
                .flatMap(requests::findByIdForUpdate)
                .orElseThrow(() -> NotFoundException.of("Service request"));
        if (request.getStatus() != ServiceRequestStatus.CANCELLED) {
            throw new ConflictException("Only a cancelled request can be deleted.");
        }
        if (caller.userId().equals(request.getRequesterId()) && neverPaid(request)) {
            documents.deleteFiledOn(request.getId());
            requests.purge(request.getId());
            audit.record(caller, "service-request.deleted", "service_request", request.getId().toString(),
                    "type", request.getType());
            return;
        }
        requests.dismiss(request.getId(), caller.userId());
        audit.record(caller, "service-request.dismissed", "service_request", request.getId().toString(),
                "type", request.getType());
    }

    // A paid row is the only trace of money taken, so it is kept and only hidden from the caller.
    // An order the gateway refuses to close is either expired (safe) or mid-payment (kept).
    private boolean neverPaid(ServiceRequest request) {
        if (events.existsByRequestIdAndEvent(request.getId(), "payment.received")) {
            return false;
        }
        String order = request.getPaymentRef();
        if (order == null) {
            return true;
        }
        if (gateway.paid(order)) {
            return false;
        }
        try {
            gateway.terminate(order);
            return true;
        } catch (RuntimeException notActive) {
            return gateway.resumeSession(order).isEmpty() && !gateway.paid(order);
        }
    }
}

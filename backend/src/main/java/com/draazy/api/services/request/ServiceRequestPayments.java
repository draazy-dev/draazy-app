package com.draazy.api.services.request;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** A customer's paid rent-agreement checkouts and top-ups, with where each refund stands. */
@Service
public class ServiceRequestPayments {

    public static final String KIND_AGREEMENT = "rent_agreement";

    public static final String KIND_AMENDMENT = "ra_amendment";

    public static final String REFUND_PENDING = "pending";

    public static final String REFUND_APPROVED = "approved";

    public static final String REFUND_REJECTED = "rejected";

    /** @param refundState the latest refund drawn on this payment: one of the {@code REFUND_*} values, or null */
    public record Payment(UUID id, String kind, UUID serviceRequestId, UUID propertyId, long amount, Instant paidAt,
            String paymentRef, String refundState) {
    }

    private final ServiceRequestRepository requests;
    private final ServiceRequestAmendmentRepository amendments;
    private final ServiceRequestRefundRepository refunds;
    private final ServiceRequestEventRepository events;

    public ServiceRequestPayments(ServiceRequestRepository requests, ServiceRequestAmendmentRepository amendments,
            ServiceRequestRefundRepository refunds, ServiceRequestEventRepository events) {
        this.requests = requests;
        this.amendments = amendments;
        this.refunds = refunds;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<Payment> paidBy(UUID userId) {
        List<Payment> out = new ArrayList<>();
        for (ServiceRequest request : requests.findByRequesterIdAndTypeAndPaymentRefNotNull(userId,
                ServiceRequestTypes.RENT_AGREEMENT)) {
            List<ServiceRequestRefund> history = refunds.findByServiceRequestIdOrderByCreatedAtDesc(request.getId());
            List<ServiceRequestAmendment> topUps = amendments.findByServiceRequestIdAndPaymentRefNotNull(request.getId())
                    .stream().filter(a -> a.delta() > 0
                            && (ServiceRequestAmendment.APPLIED.equals(a.getStatus()) || a.getPaidAt() != null))
                    .toList();
            long first = (request.getAmount() == null ? 0 : request.getAmount())
                    - topUps.stream().mapToLong(ServiceRequestAmendment::delta).sum();
            out.add(new Payment(request.getId(), KIND_AGREEMENT, request.getId(), request.getPropertyId(), first,
                    paidAt(request), request.getPaymentRef(), stateOf(history, request.getPaymentRef())));
            for (ServiceRequestAmendment topUp : topUps) {
                out.add(new Payment(topUp.getId(), KIND_AMENDMENT, request.getId(), request.getPropertyId(),
                        topUp.delta(), topUp.getPaidAt() != null ? topUp.getPaidAt() : topUp.getCreatedAt(),
                        topUp.getPaymentRef(), stateOf(history, topUp.getPaymentRef())));
            }
        }
        return out;
    }

    private Instant paidAt(ServiceRequest request) {
        return events.findByRequestIdOrderByAtAsc(request.getId()).stream()
                .filter(e -> "payment.received".equals(e.getEvent())).map(ServiceRequestEvent::getAt).findFirst()
                .orElse(request.getStatusChangedAt());
    }

    private static String stateOf(List<ServiceRequestRefund> history, String orderId) {
        return history.stream().filter(r -> orderId.equals(r.getOrderId())).findFirst()
                .map(r -> switch (r.getStatus()) {
                    case ServiceRequestRefund.REQUESTED -> REFUND_PENDING;
                    case ServiceRequestRefund.APPROVED -> REFUND_APPROVED;
                    case ServiceRequestRefund.REJECTED -> REFUND_REJECTED;
                    default -> null;
                }).orElse(null);
    }
}
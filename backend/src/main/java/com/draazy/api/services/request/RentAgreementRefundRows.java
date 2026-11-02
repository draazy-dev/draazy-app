package com.draazy.api.services.request;

import com.draazy.api.billing.refund.RefundDesk;
import com.draazy.api.billing.refund.RefundStatuses;
import com.draazy.api.billing.refund.RentAgreementRefundSource;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Read-only rows for the refunds desk; deciding stays with ServiceRequestRefunds and its manager rule. */
@Component
class RentAgreementRefundRows implements RentAgreementRefundSource {
    private static final Map<String, List<String>> BY_DESK_STATUS = Map.of(
            RefundStatuses.PENDING_REVIEW, List.of(ServiceRequestRefund.REQUESTED),
            RefundStatuses.APPROVED, List.of(ServiceRequestRefund.APPROVED, ServiceRequestRefund.FAILED),
            RefundStatuses.REJECTED, List.of(ServiceRequestRefund.REJECTED));

    private final ServiceRequestRefundRepository refunds;
    private final ServiceRequestRepository requests;
    private final UserRepository users;

    RentAgreementRefundRows(ServiceRequestRefundRepository refunds, ServiceRequestRepository requests,
            UserRepository users) {
        this.refunds = refunds;
        this.requests = requests;
        this.users = users;
    }

    @Override
    public List<String> statusesFor(String deskStatus) {
        return BY_DESK_STATUS.get(deskStatus);
    }

    @Override
    public long count(String deskStatus) {
        return refunds.countByStatusIn(statusesFor(deskStatus));
    }

    @Override
    public Map<UUID, RefundDesk.Row> rows(Collection<UUID> ids) {
        List<ServiceRequestRefund> found = refunds.findAllById(ids);
        Map<UUID, UUID> requesterOf = new HashMap<>();
        requests.findAllById(found.stream().map(ServiceRequestRefund::getServiceRequestId).distinct().toList())
                .forEach(request -> requesterOf.put(request.getId(), request.getRequesterId()));
        Map<UUID, User> people = new HashMap<>();
        users.findAllById(requesterOf.values().stream().filter(Objects::nonNull).distinct().toList())
                .forEach(user -> people.put(user.getId(), user));
        return found.stream().collect(Collectors.toMap(ServiceRequestRefund::getId,
                refund -> row(refund, people.get(requesterOf.get(refund.getServiceRequestId())))));
    }

    private static RefundDesk.Row row(ServiceRequestRefund refund, User customer) {
        return new RefundDesk.Row(refund.getId().toString(), deskStatus(refund.getStatus()),
                RefundStatuses.KIND_RENT_AGREEMENT, "Rent agreement",
                customer == null ? null : customer.getId().toString(),
                customer == null ? null : customer.getName(), customer == null ? null : customer.getMobile(),
                refund.getOrderId(), refund.getAmount(), null, refund.getReason(), refund.getCreatedAt(),
                refund.getDecidedAt(), refund.getDecisionNote(), null, null, null, null,
                refund.getServiceRequestId().toString());
    }

    private static String deskStatus(String status) {
        return ServiceRequestRefund.REQUESTED.equals(status) ? RefundStatuses.PENDING_REVIEW : status;
    }
}

package com.draazy.api.billing.refund;

import com.draazy.api.billing.credit.CreditNote;
import com.draazy.api.billing.credit.CreditNoteRepository;
import com.draazy.api.billing.credit.CreditNotes;
import com.draazy.api.billing.plan.Plan;
import com.draazy.api.billing.plan.PlanRepository;
import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.Instant;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The staff desk's read side: customer requests, the system's own refunds, and orders under dispute. */
@Service
public class RefundDesk {

    /** Only the review queue carries signals: they replay a customer's history, which a decided row does not need. */
    public record Signals(long refunds12m, long linkedAccounts, long contactsUsed, long enquiries,
            boolean pausedDuringWindow) {
    }

    public record Row(String id, String status, String kind, String label, String customerId, String customerName,
            String customerMobile, String orderRef, long amount, String basis, String customerReason,
            Instant requestedAt, Instant decidedAt, String decisionReason, String propertyId, String creditNoteNo,
            Signals signals) {
    }

    // What one page of rows needs, loaded once for the whole page.
    private record Lookup(Map<UUID, Subscription> orders, Map<UUID, Plan> plans, Map<UUID, User> people,
            Map<UUID, String> notes) {

        String name(UUID userId) {
            User u = userId == null ? null : people.get(userId);
            return u == null ? null : u.getName();
        }

        String mobile(UUID userId) {
            User u = userId == null ? null : people.get(userId);
            return u == null ? null : u.getMobile();
        }
    }

    private final RefundRequestRepository requests;
    private final PaymentDisputeRepository disputes;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final UserRepository users;
    private final CreditNoteRepository creditNotes;
    private final RefundAssessor assessor;

    public RefundDesk(RefundRequestRepository requests, PaymentDisputeRepository disputes,
            SubscriptionRepository subscriptions, PlanRepository plans, UserRepository users,
            CreditNoteRepository creditNotes, RefundAssessor assessor) {
        this.requests = requests;
        this.disputes = disputes;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.users = users;
        this.creditNotes = creditNotes;
        this.assessor = assessor;
    }

    @Transactional(readOnly = true)
    public Page<Row> list(String status, Pageable pageable) {
        String filter = status == null || status.isBlank() ? RefundStatuses.PENDING_REVIEW : status;
        if (!RefundStatuses.DESK_FILTERS.contains(filter)) {
            throw new BadRequestException("status must be one of " + RefundStatuses.DESK_FILTERS.stream().sorted().toList());
        }
        return switch (filter) {
            case RefundStatuses.AUTO -> {
                Page<Subscription> page = requests.findAutoRefunds(pageable);
                Lookup lookup = lookup(page.getContent().stream().map(Subscription::getId).toList(),
                        page.getContent().stream().map(Subscription::getUserId).toList());
                yield page.map(order -> autoRow(order, lookup));
            }
            case RefundStatuses.DISPUTED -> {
                Page<PaymentDispute> page = disputes.findByStatus(PaymentDispute.OPEN,
                        PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                                Sort.by(Sort.Direction.DESC, "openedAt")));
                Lookup lookup = lookup(page.getContent().stream().map(PaymentDispute::getSubscriptionId).toList(),
                        page.getContent().stream().map(PaymentDispute::getUserId).toList());
                yield page.map(dispute -> disputeRow(dispute, lookup));
            }
            default -> {
                Page<RefundRequest> page = requests.findByStatus(filter, PageRequest.of(pageable.getPageNumber(),
                        pageable.getPageSize(), Sort.by(Sort.Direction.DESC, "createdAt")));
                Lookup lookup = lookup(page.getContent().stream().map(RefundRequest::getSubscriptionId).toList(),
                        page.getContent().stream().map(RefundRequest::getUserId).toList());
                yield page.map(request -> requestRow(request, lookup));
            }
        };
    }

    @Transactional(readOnly = true)
    public Map<String, Long> counts() {
        Map<String, Long> totals = new LinkedHashMap<>();
        for (String status : List.of(RefundStatuses.PENDING_REVIEW, RefundStatuses.APPROVED, RefundStatuses.REJECTED)) {
            totals.put(status, requests.countByStatus(status));
        }
        totals.put(RefundStatuses.AUTO, requests.findAutoRefunds(PageRequest.of(0, 1)).getTotalElements());
        totals.put(RefundStatuses.DISPUTED, disputes.countByStatus(PaymentDispute.OPEN));
        return totals;
    }

    @Transactional(readOnly = true)
    public Row row(RefundRequest request) {
        return requestRow(request, lookup(List.of(request.getSubscriptionId()), List.of(request.getUserId())));
    }

    private Row requestRow(RefundRequest request, Lookup lookup) {
        Subscription order = lookup.orders().get(request.getSubscriptionId());
        Plan plan = lookup.plans().get(order.getPlanId());
        Signals signals = RefundStatuses.PENDING_REVIEW.equals(request.getStatus())
                ? signals(order, plan, request.getDeviceIdHash(), request.getCreatedAt()) : null;
        return new Row(request.getId().toString(), request.getStatus(), request.getKind(), plan.getName(),
                request.getUserId().toString(), lookup.name(request.getUserId()), lookup.mobile(request.getUserId()),
                order.getPaymentRef(),
                request.getAmount(), request.getBasis(), request.getCustomerReason(), request.getCreatedAt(),
                request.getDecidedAt(), request.getDecisionReason(), idOf(order.getPropertyId()),
                lookup.notes().get(order.getId()), signals);
    }

    private Row autoRow(Subscription order, Lookup lookup) {
        Plan plan = lookup.plans().get(order.getPlanId());
        return new Row(order.getId().toString(), RefundStatuses.AUTO, RefundAssessor.kindOf(plan), plan.getName(),
                order.getUserId().toString(), lookup.name(order.getUserId()), lookup.mobile(order.getUserId()),
                order.getPaymentRef(),
                order.getRefundAmount() != null ? order.getRefundAmount() : order.getAmount(), null, null,
                order.getRefundDueAt(), null, null, idOf(order.getPropertyId()), lookup.notes().get(order.getId()),
                null);
    }

    private Row disputeRow(PaymentDispute dispute, Lookup lookup) {
        Subscription order = dispute.getSubscriptionId() == null ? null : lookup.orders().get(dispute.getSubscriptionId());
        Plan plan = order == null ? null : lookup.plans().get(order.getPlanId());
        UUID customer = dispute.getUserId();
        return new Row(dispute.getId().toString(), RefundStatuses.DISPUTED,
                plan == null ? null : RefundAssessor.kindOf(plan),
                plan == null ? null : plan.getName(), customer == null ? null : customer.toString(),
                lookup.name(customer), lookup.mobile(customer), dispute.getOrderRef(),
                dispute.getAmount() != null ? dispute.getAmount() : order == null ? 0L : order.getAmount(), null,
                dispute.getReason(), dispute.getOpenedAt(), dispute.getClosedAt(), null,
                order == null ? null : idOf(order.getPropertyId()), null, null);
    }

    private Signals signals(Subscription order, Plan plan, String device, Instant asOf) {
        String instrument = order.getPaymentInstrumentHash();
        boolean pass = RefundAssessor.isPass(plan);
        return new Signals(assessor.refunds12m(order.getUserId(), device, instrument, Instant.now()),
                assessor.linkedAccounts(order.getUserId(), device, instrument),
                assessor.contactsUsed(order, plan, asOf),
                pass ? assessor.enquiries(order, Instant.now()) : 0,
                pass && assessor.pausedDuringWindow(order));
    }

    private Lookup lookup(Collection<UUID> orderIds, Collection<UUID> userIds) {
        List<UUID> ids = orderIds.stream().filter(Objects::nonNull).distinct().toList();
        Map<UUID, Subscription> orders = subscriptions.findAllById(ids).stream()
                .collect(Collectors.toMap(Subscription::getId, Function.identity()));
        List<UUID> planIds = orders.values().stream().map(Subscription::getPlanId).distinct().toList();
        Map<UUID, Plan> planById = plans.findAllById(planIds).stream()
                .collect(Collectors.toMap(Plan::getId, Function.identity()));
        Map<UUID, User> people = new HashMap<>();
        users.findAllById(userIds.stream().filter(Objects::nonNull).distinct().toList())
                .forEach(u -> people.put(u.getId(), u));
        Map<UUID, String> notes = creditNotes.findBySourceTypeAndSourceIdIn(CreditNotes.SUBSCRIPTION, ids).stream()
                .collect(Collectors.toMap(CreditNote::getSourceId, CreditNote::getNumber, (a, b) -> a));
        return new Lookup(orders, planById, people, notes);
    }

    private static String idOf(UUID id) {
        return id == null ? null : id.toString();
    }
}

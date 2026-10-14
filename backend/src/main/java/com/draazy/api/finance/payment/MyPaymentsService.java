package com.draazy.api.finance.payment;

import com.draazy.api.billing.credit.CreditNote;
import com.draazy.api.billing.credit.CreditNoteRepository;
import com.draazy.api.billing.credit.Invoice;
import com.draazy.api.billing.credit.InvoiceRepository;
import com.draazy.api.billing.credit.Invoices;
import com.draazy.api.billing.plan.Plan;
import com.draazy.api.billing.plan.PlanRepository;
import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.billing.referral.ReferralSignals;
import com.draazy.api.billing.refund.PaymentDispute;
import com.draazy.api.billing.refund.PaymentDisputeRepository;
import com.draazy.api.billing.refund.RefundAssessor;
import com.draazy.api.billing.refund.RefundRequest;
import com.draazy.api.billing.refund.RefundRequestRepository;
import com.draazy.api.billing.refund.RefundService;
import com.draazy.api.billing.refund.RefundStatuses;
import com.draazy.api.billing.refund.RefundVerdict;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.services.request.ServiceRequestPayments;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The caller's paid orders across passes, packs and rent agreements, each with where its refund stands. */
@Service
public class MyPaymentsService {

    private static final Set<String> PAID_STATES = Set.of(SubscriptionStatuses.ACTIVE, SubscriptionStatuses.PAST_DUE,
            SubscriptionStatuses.EXPIRED, SubscriptionStatuses.REFUND_REVIEW, SubscriptionStatuses.REFUNDED,
            SubscriptionStatuses.DISPUTED);

    private static final String KIND_PASS = "listing_pass";
    private static final String KIND_PACK = "contact_pack";

    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final RefundRequestRepository refundRequests;
    private final PaymentDisputeRepository disputes;
    private final CreditNoteRepository creditNotes;
    private final InvoiceRepository invoices;
    private final ServiceRequestPayments agreements;
    private final RefundAssessor assessor;
    private final RefundService refundService;
    private final ReferralSignals signals;

    public MyPaymentsService(SubscriptionRepository subscriptions, PlanRepository plans,
            RefundRequestRepository refundRequests, PaymentDisputeRepository disputes,
            CreditNoteRepository creditNotes, InvoiceRepository invoices, ServiceRequestPayments agreements,
            RefundAssessor assessor, RefundService refundService, ReferralSignals signals) {
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.refundRequests = refundRequests;
        this.disputes = disputes;
        this.creditNotes = creditNotes;
        this.invoices = invoices;
        this.agreements = agreements;
        this.assessor = assessor;
        this.refundService = refundService;
        this.signals = signals;
    }

    @Transactional(readOnly = true)
    public List<MyPaymentDto> list(AuthPrincipal caller, String deviceHeader) {
        UUID userId = caller.userId();
        Map<String, String> noteByOrder = noteNumbers(userId);
        String device = signals.deviceIdHash(deviceHeader);
        List<Subscription> orders = subscriptions.findByUserIdOrderByStartedAtDesc(userId).stream()
                .filter(MyPaymentsService::wasPaid).toList();
        Map<UUID, Plan> planById = plans.findAllById(orders.stream().map(Subscription::getPlanId).distinct().toList())
                .stream().collect(Collectors.toMap(Plan::getId, Function.identity()));
        Map<UUID, RefundRequest> requestByOrder = requestsByOrder(orders);
        Set<String> disputed = openDisputes(orders);
        Instant now = Instant.now();
        Map<UUID, String> orderInvoices = invoiceNumbers(Invoices.SUBSCRIPTION, orders.stream().map(Subscription::getId));
        List<MyPaymentDto> rows = new java.util.ArrayList<>();
        for (Subscription order : orders) {
            Plan plan = planById.get(order.getPlanId());
            if (plan != null && (RefundAssessor.isPack(plan) || RefundAssessor.isPass(plan))) {
                rows.add(row(order, plan, requestByOrder.get(order.getId()), disputed, noteByOrder, device, now,
                        orderInvoices.get(order.getId())));
            }
        }
        List<ServiceRequestPayments.Payment> agreementPayments = agreements.paidBy(userId);
        Map<UUID, String> checkoutInvoices = invoiceNumbers(Invoices.SERVICE_REQUEST, agreementPayments.stream()
                .filter(p -> ServiceRequestPayments.KIND_AGREEMENT.equals(p.kind())).map(ServiceRequestPayments.Payment::id));
        Map<UUID, String> amendmentInvoices = invoiceNumbers(Invoices.SERVICE_REQUEST_AMENDMENT, agreementPayments.stream()
                .filter(p -> ServiceRequestPayments.KIND_AMENDMENT.equals(p.kind())).map(ServiceRequestPayments.Payment::id));
        for (ServiceRequestPayments.Payment payment : agreementPayments) {
            boolean checkout = ServiceRequestPayments.KIND_AGREEMENT.equals(payment.kind());
            rows.add(agreementRow(payment, noteByOrder, (checkout ? checkoutInvoices : amendmentInvoices).get(payment.id())));
        }
        rows.sort(Comparator.comparing(MyPaymentDto::paidAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return rows;
    }

    @Transactional
    public MyPaymentDto requestRefund(AuthPrincipal caller, UUID orderId, String reason, String idempotencyKey,
            String deviceHeader) {
        refundService.request(caller, orderId, reason, idempotencyKey, deviceHeader);
        String id = orderId.toString();
        return list(caller, deviceHeader).stream().filter(r -> r.id().equals(id)).findFirst()
                .orElseThrow(() -> NotFoundException.of("Payment"));
    }

    private MyPaymentDto row(Subscription order, Plan plan, RefundRequest request, Set<String> disputed,
            Map<String, String> noteByOrder, String device, Instant now, String invoiceNo) {
        String note = order.getPaymentRef() == null ? null : noteByOrder.get(order.getPaymentRef());
        RefundVerdict verdict = assessor.forCustomer(order, plan, request != null, device, now);
        MyPaymentDto.Refund refund = new MyPaymentDto.Refund(verdict.eligible(), verdict.reason(), verdict.from(),
                verdict.until(), order.getAmount());
        return new MyPaymentDto(order.getId().toString(), RefundAssessor.isPack(plan) ? KIND_PACK : KIND_PASS,
                plan.getName(), order.getAmount(), order.getStartedAt(), invoiceNo,
                statusOf(order, request, note, disputed.contains(order.getPaymentRef())), note,
                order.getPropertyId() == null ? null : order.getPropertyId().toString(), null, refund);
    }

    private static MyPaymentDto agreementRow(ServiceRequestPayments.Payment payment, Map<String, String> noteByOrder,
            String invoiceNo) {
        String note = noteByOrder.get(payment.paymentRef());
        String status = ServiceRequestPayments.REFUND_APPROVED.equals(payment.refundState())
                ? (note != null ? MyPaymentDto.REFUNDED : MyPaymentDto.REFUND_PENDING)
                : ServiceRequestPayments.REFUND_PENDING.equals(payment.refundState()) ? MyPaymentDto.REFUND_PENDING
                : ServiceRequestPayments.REFUND_REJECTED.equals(payment.refundState()) ? MyPaymentDto.REFUND_REJECTED
                : MyPaymentDto.PAID;
        boolean agreement = ServiceRequestPayments.KIND_AGREEMENT.equals(payment.kind());
        return new MyPaymentDto(payment.id().toString(), payment.kind(),
                agreement ? "Rent agreement" : "Rent agreement amendment", payment.amount(), payment.paidAt(),
                invoiceNo, status, note,
                payment.propertyId() == null ? null : payment.propertyId().toString(),
                payment.serviceRequestId().toString(), null);
    }

    private static String statusOf(Subscription order, RefundRequest request, String note, boolean disputed) {
        if (disputed || SubscriptionStatuses.DISPUTED.equals(order.getStatus())) {
            return MyPaymentDto.DISPUTED;
        }
        if (note != null || order.getRefundRef() != null || SubscriptionStatuses.REFUNDED.equals(order.getStatus())) {
            return MyPaymentDto.REFUNDED;
        }
        if (order.getRefundDueAt() != null || SubscriptionStatuses.REFUND_REVIEW.equals(order.getStatus())) {
            return MyPaymentDto.REFUND_PENDING;
        }
        return request != null && RefundStatuses.REJECTED.equals(request.getStatus())
                ? MyPaymentDto.REFUND_REJECTED : MyPaymentDto.PAID;
    }

    private static boolean wasPaid(Subscription order) {
        return order.getAmount() > 0 && (PAID_STATES.contains(order.getStatus()) || order.getRefundDueAt() != null);
    }

    private Map<String, String> noteNumbers(UUID userId) {
        Map<String, String> byOrder = new HashMap<>();
        for (CreditNote note : creditNotes.findByUserIdOrderByIssuedAtDesc(userId)) {
            byOrder.putIfAbsent(note.getOrderRef(), note.getNumber());
        }
        return byOrder;
    }

    private Map<UUID, RefundRequest> requestsByOrder(List<Subscription> orders) {
        return refundRequests.findBySubscriptionIdIn(orders.stream().map(Subscription::getId).toList()).stream()
                .collect(Collectors.toMap(RefundRequest::getSubscriptionId, Function.identity()));
    }

    private Set<String> openDisputes(List<Subscription> orders) {
        List<String> refs = orders.stream().map(Subscription::getPaymentRef).filter(java.util.Objects::nonNull).toList();
        return refs.isEmpty() ? Set.of() : disputes.findByOrderRefInAndStatus(refs, PaymentDispute.OPEN).stream()
                .map(PaymentDispute::getOrderRef).collect(Collectors.toSet());
    }

    private Map<UUID, String> invoiceNumbers(String sourceType, java.util.stream.Stream<UUID> sourceIds) {
        List<UUID> ids = sourceIds.toList();
        return ids.isEmpty() ? Map.of() : invoices.findBySourceTypeAndSourceIdIn(sourceType, ids).stream()
                .collect(Collectors.toMap(Invoice::getSourceId, Invoice::getNumber));
    }
}
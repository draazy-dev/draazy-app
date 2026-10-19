package com.draazy.api.finance.payment;

import com.draazy.api.billing.BillingPayments;
import com.draazy.api.billing.refund.PaymentDisputes;
import com.draazy.api.common.web.Routes;
import com.draazy.api.provider.PaymentGateway;
import com.draazy.api.provider.ProviderCalls;
import com.draazy.api.provider.cashfree.WebhookSignature;
import com.draazy.api.services.request.ServiceRequestAmendments;
import com.draazy.api.services.request.ServiceRequestRefunds;
import com.draazy.api.services.request.ServiceRequestService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

// Cashfree payment callback — source of truth for whether a purchase was paid.
// Rationale: docs/flows/admin/finance.md#payment-webhook-signature-raw-body-idempotent-always-200
@RestController
public class PaymentWebhookController {

    private static final Logger log = LoggerFactory.getLogger(PaymentWebhookController.class);

    /** Provider status meaning the money moved. */
    private static final String PROVIDER_SUCCESS = "SUCCESS";

    private static final String REFUND_EVENT = "REFUND_STATUS_WEBHOOK";

    private static final String PASS_REFUND_PREFIX = "lp_";

    private static final String REQUEST_REFUND_PREFIX = "rf_";

    private static final String DISPUTE_EVENT_PREFIX = "DISPUTE_";

    private final BillingPayments billingPayments;
    private final ServiceRequestService serviceRequests;
    private final ServiceRequestAmendments amendments;
    private final ServiceRequestRefunds refunds;
    private final WebhookSignature webhookSignature;
    private final ObjectMapper objectMapper;
    private final ProviderCalls calls;

    public PaymentWebhookController(BillingPayments billingPayments,
            ServiceRequestService serviceRequests, ServiceRequestAmendments amendments,
            ServiceRequestRefunds refunds, WebhookSignature webhookSignature, ObjectMapper objectMapper, ProviderCalls calls) {
        this.billingPayments = billingPayments;
        this.serviceRequests = serviceRequests;
        this.amendments = amendments;
        this.refunds = refunds;
        this.webhookSignature = webhookSignature;
        this.objectMapper = objectMapper;
        this.calls = calls;
    }

    /** {@code POST /webhooks/cashfree/payment}; timestamp is signed so a callback cannot be replayed. */
    @PostMapping(Routes.Webhooks.CASHFREE_PAYMENT)
    @ResponseStatus(HttpStatus.OK)
    public void cashfreePaymentWebhook(
            @RequestHeader(name = "x-webhook-signature", required = false) String signature,
            @RequestHeader(name = "x-webhook-timestamp", required = false) String timestamp,
            @RequestBody(required = false) byte[] rawBody) {

        WebhookSignature.Verification verification =
                webhookSignature.verify(signature, timestamp, rawBody);
        if (verification != WebhookSignature.Verification.VERIFIED) {
            logRefusal(verification, timestamp);
            calls.record(ProviderCalls.CASHFREE, PaymentGateway.WEBHOOK, ProviderCalls.Outcome.FAILED,
                    null, null, "signature " + verification, null);
            return;
        }
        try {
            JsonNode root = objectMapper.readTree(rawBody);
            String eventType = root.path("type").asString(null);
            if (REFUND_EVENT.equals(eventType)) {
                settleRefund(root.path("data").path("refund"));
                return;
            }
            if (eventType != null && eventType.startsWith(DISPUTE_EVENT_PREFIX)) {
                settleDispute(eventType, root.path("data"));
                return;
            }
            JsonNode data = root.path("data");
            JsonNode payment = data.path("payment");

            String orderId = data.path("order").path("order_id").asString(null);
            String providerStatus = payment.path("payment_status").asString(null);
            boolean paid = PROVIDER_SUCCESS.equals(providerStatus);
            if (paid) {
                recordInstrument(orderId, payment.path("payment_method"));
            }

            String paymentTime = payment.path("payment_time").asString(null);
            Instant settledAt = settlementInstant(paymentTime);
            BigDecimal exactAmount = exactAmount(payment.path("payment_amount").asString(null));
            String currency = payment.path("payment_currency").asString(null);

            // Three families settle here; each ignores an order id it does not own. Each gets its
            // own try/catch so a failure in one cannot rob the others of the event.
            List<Settlement> outcomes = List.of(
                    settle("subscription",
                            () -> billingPayments.settleSubscription(orderId, paid, settledAt, exactAmount, currency)),
                    settle("service-request",
                            () -> serviceRequests.applyWebhookOutcome(orderId, paid, exactAmount, currency)),
                    settle("amendment", () -> amendments.applyWebhookOutcome(orderId, paid, exactAmount, currency)));

            boolean unreconciled = paid && !outcomes.contains(Settlement.CLAIMED);
            if (unreconciled) {

                if (outcomes.contains(Settlement.FAILED)) {
                    log.error("Paid webhook for order {} was not settled: a handler failed (see the "
                            + "error above). The payment is unreconciled and will not be retried", orderId);
                } else {
                    log.error("Paid webhook for order {} matched no subscription, service request "
                            + "or amendment; the payment is unreconciled", orderId);
                }
            }
            calls.record(ProviderCalls.CASHFREE, PaymentGateway.WEBHOOK,
                    unreconciled ? ProviderCalls.Outcome.FAILED : ProviderCalls.Outcome.OK,
                    null, orderId, unreconciled ? providerStatus + " unreconciled" : providerStatus, null);

        } catch (Exception unprocessable) {

            // why: a signed-but-unreadable payload is our bug or a provider change, not the
            // sender's problem. Retrying will not help, so we swallow it and keep the 200 contract.
            log.error("Signed payment webhook could not be processed", unprocessable);
            calls.record(ProviderCalls.CASHFREE, PaymentGateway.WEBHOOK, ProviderCalls.Outcome.FAILED,
                    null, null, "unprocessable", null);
        }
    }

    // Refund status events share this endpoint but carry no payment, so they must not reach settlement families.
    private void settleRefund(JsonNode refund) {
        String refundId = refund.path("refund_id").asString(null);
        String status = refund.path("refund_status").asString(null);
        String gatewayRef = refund.path("cf_refund_id").asString(null);
        String orderId = refund.path("order_id").asString(null);
        BigDecimal amount = exactAmount(refund.path("refund_amount").asString(null));
        Settlement outcome = settle("refund", () -> routeRefund(refundId, status, gatewayRef, orderId, amount));
        boolean ok = outcome == Settlement.CLAIMED;
        if (outcome == Settlement.NOT_MINE) {
            log.warn("Refund webhook {} ({}) on order {} changed nothing here", refundId, status, orderId);
        }
        calls.record(ProviderCalls.CASHFREE, PaymentGateway.WEBHOOK,
                ok ? ProviderCalls.Outcome.OK : ProviderCalls.Outcome.FAILED,
                null, orderId, "refund " + status, null);
    }

    // Any other refund id was made on the Cashfree dashboard, and only a completed one changes anything.
    private boolean routeRefund(String refundId, String status, String gatewayRef, String orderId, BigDecimal amount) {
        if (refundId != null && refundId.startsWith(PASS_REFUND_PREFIX)) {
            return billingPayments.settleRefund(refundId, status, gatewayRef);
        }
        if (refundId != null && refundId.startsWith(REQUEST_REFUND_PREFIX)) {
            return refunds.applyWebhookOutcome(refundId, status);
        }
        if (!PROVIDER_SUCCESS.equals(status) || amount == null || amount.signum() <= 0) {
            return false;
        }
        long rupees = amount.setScale(0, RoundingMode.DOWN).longValue();
        return billingPayments.settleOutsideRefund(orderId, gatewayRef, rupees)
                || refunds.applyOutsideRefund(orderId, gatewayRef, rupees);
    }

    // Disputes freeze one order and tell the refunds desk; an unknown DISPUTE_* type still freezes on first sight.
    private void settleDispute(String eventType, JsonNode data) {
        JsonNode dispute = data.path("dispute");
        String orderId = data.path("order_details").path("order_id").asString(null);
        if (orderId == null) {
            orderId = data.path("order").path("order_id").asString(null);
        }
        BigDecimal amount = exactAmount(dispute.path("dispute_amount").asString(null));
        String finalOrderId = orderId;
        Settlement outcome = settle("dispute", () -> {
            billingPayments.applyDispute(new PaymentDisputes.Event(eventType,
                    dispute.path("dispute_id").asString(null), finalOrderId,
                    dispute.path("dispute_status").asString(null), amount == null ? null : amount.longValue(),
                    dispute.path("reason_description").asString(null)));
            return true;
        });
        calls.record(ProviderCalls.CASHFREE, PaymentGateway.WEBHOOK,
                outcome == Settlement.CLAIMED ? ProviderCalls.Outcome.OK : ProviderCalls.Outcome.FAILED,
                null, orderId, eventType, null);
    }

    // The card or UPI id behind a payment, so accounts paying from the same instrument can be linked.
    private void recordInstrument(String orderId, JsonNode method) {
        String card = method.path("card").path("card_number").asString(null);
        String upi = method.path("upi").path("upi_id").asString(null);
        String fingerprint = card != null ? "card:" + card : upi != null ? "upi:" + upi : null;
        if (orderId == null || fingerprint == null) {
            return;
        }
        try {
            billingPayments.recordInstrument(orderId, fingerprint);
        } catch (Exception failed) {
            log.warn("Could not record the payment instrument for order {}", orderId, failed);
        }
    }

    // Only HMAC-authenticated stale callbacks cost money, so only they log as errors.
    private void logRefusal(WebhookSignature.Verification verification, String timestamp) {
        switch (verification) {
            case STALE -> log.error("Rejected payment webhook: STALE (x-webhook-timestamp={}); this "
                    + "one was signed with our key, so it is a genuine callback refused on the "
                    + "clock — money that will not be reconciled. Check for drift between Cashfree "
                    + "and this host", timestamp.trim());
            case MISMATCH -> log.warn("Rejected payment webhook: MISMATCH — well-formed signature, "
                    + "wrong key. Occasional lines here are unauthenticated internet noise; a "
                    + "sustained run alongside failing order creation means CASHFREE_WEBHOOK_SECRET "
                    + "is not the key Cashfree signs with");
            default -> log.warn("Rejected payment webhook: {}", verification);
        }
    }

    private enum Settlement {

        CLAIMED,

        NOT_MINE,

        FAILED
    }

    private Settlement settle(String handler, BooleanSupplier settlement) {
        try {
            return settlement.getAsBoolean() ? Settlement.CLAIMED : Settlement.NOT_MINE;
        } catch (Exception failed) {
            log.error("Payment webhook handler '{}' failed; the other handlers still ran", handler,
                    failed);
            return Settlement.FAILED;
        }
    }

    // Bad provider timestamps fall back to now rather than failing the callback.
    private static Instant settlementInstant(String paymentTime) {
        if (paymentTime == null || paymentTime.isBlank()) {
            return Instant.now();
        }
        try {
            return OffsetDateTime.parse(paymentTime).toInstant();
        } catch (DateTimeParseException unparseable) {
            log.warn("Unparseable payment_time '{}'; stamping now", paymentTime);
            return Instant.now();
        }
    }

    // Null when absent or unreadable, so a payload that omits the sum is not mistaken for an underpayment.
    private static BigDecimal exactAmount(String decimalAmount) {
        if (decimalAmount == null || decimalAmount.isBlank()) {
            return null;
        }
        try {
            return new BigDecimal(decimalAmount.trim());
        } catch (NumberFormatException notANumber) {
            return null;
        }
    }
}

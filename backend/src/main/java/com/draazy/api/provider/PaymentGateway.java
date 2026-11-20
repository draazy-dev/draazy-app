package com.draazy.api.provider;

import com.draazy.api.common.payments.CheckoutTtl;
import com.draazy.api.provider.cashfree.CashfreeClient;
import com.draazy.api.provider.cashfree.CashfreeProperties;
import java.net.URI;
import java.net.URISyntaxException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;

public interface PaymentGateway {
    String CREATE_ORDER = "create-order";
    String TERMINATE = "terminate-order";
    String REFUND = "refund";
    String WEBHOOK = "webhook";

    default PaymentOrder createOrder(long amountInr, String reference) {
        return createOrder(amountInr, reference, null);
    }

    PaymentOrder createOrder(long amountInr, String reference, Customer customer);

    default PaymentOrder createOrder(long amountInr, String reference, Customer customer, String returnPath) {
        return createOrder(amountInr, reference, customer);
    }

    default void terminate(String orderId) {
    }

    Optional<String> resumeSession(String orderId);

    boolean paid(String orderId);

    boolean lastAttemptFailed(String orderId);

    String refund(String orderId, long amountInr, String refundId, String note);

    Optional<String> findRefund(String orderId, String refundId);

    record PaymentOrder(String orderId, String paymentSessionId) {
    }

    record Customer(String id, String phone) {
    }
}

@Component
@ConditionalOnProperty(prefix = "draazy.providers.cashfree", name = "enabled",
        havingValue = "false", matchIfMissing = true)
class MockPaymentGateway implements PaymentGateway {
    private final ProviderCalls calls;

    MockPaymentGateway(ProviderCalls calls) {
        this.calls = calls;
    }

    @Override
    public PaymentOrder createOrder(long amountInr, String reference, Customer customer) {
        String orderId = "mock_order_" + UUID.randomUUID();
        calls.record(ProviderCalls.CASHFREE, CREATE_ORDER, ProviderCalls.Outcome.SKIPPED,
                customer == null ? null : customer.phone(), orderId, "mock", null);
        return new PaymentOrder(orderId, "mock_session_" + UUID.randomUUID());
    }

    @Override
    public Optional<String> resumeSession(String orderId) {
        return Optional.of("mock_session_" + UUID.randomUUID());
    }

    @Override
    public boolean paid(String orderId) {
        return false;
    }

    @Override
    public boolean lastAttemptFailed(String orderId) {
        return false;
    }

    @Override
    public String refund(String orderId, long amountInr, String refundId, String note) {
        calls.record(ProviderCalls.CASHFREE, REFUND, ProviderCalls.Outcome.SKIPPED, null, orderId, "mock", null);
        return "mock_refund_" + refundId;
    }

    @Override
    public Optional<String> findRefund(String orderId, String refundId) {
        return Optional.empty();
    }
}

@Component
@ConditionalOnProperty(prefix = "draazy.providers.cashfree", name = "enabled", havingValue = "true")
class CashfreePaymentGateway implements PaymentGateway {
    private static final String API_VERSION = "2025-01-01";

    private static final String PLACEHOLDER_PHONE = "9999999999";

    private static final Set<String> FAILED_ATTEMPTS = Set.of("FAILED", "USER_DROPPED", "VOID", "CANCELLED");

    private static final String NOTIFY_URL_REQUIREMENT =
            "draazy.providers.cashfree.notify-url (CASHFREE_NOTIFY_URL) must be blank or an "
                    + "absolute https URL; Cashfree posts settlement data to it.";

    private final CashfreeClient cashfree;
    private final CheckoutTtl ttl;
    private final String notifyUrl;
    private final String returnBase;
    private final ProviderCalls calls;

    CashfreePaymentGateway(CashfreeClient cashfree, CheckoutTtl ttl, CashfreeProperties props,
            ProviderCalls calls, @Value("${draazy.app.base-url:}") String appBaseUrl) {
        this.cashfree = cashfree;
        this.ttl = ttl;
        this.notifyUrl = requireHttpsOrBlank(props.notifyUrl());
        this.returnBase = httpsOrBlank(appBaseUrl);
        this.calls = calls;
    }

    private static String httpsOrBlank(String base) {
        String trimmed = base == null ? "" : base.trim();
        return trimmed.regionMatches(true, 0, "https://", 0, 8) ? trimmed.replaceAll("/+$", "") : "";
    }

    private static String requireHttpsOrBlank(String configured) {
        if (configured == null || configured.isBlank()) {
            return "";
        }
        String trimmed = configured.trim();
        URI parsed;
        try {
            parsed = new URI(trimmed);
        } catch (URISyntaxException malformed) {
            throw new IllegalStateException(NOTIFY_URL_REQUIREMENT + " Got: " + trimmed, malformed);
        }

        if (!"https".equalsIgnoreCase(parsed.getScheme()) || parsed.getHost() == null) {
            throw new IllegalStateException(NOTIFY_URL_REQUIREMENT + " Got: " + trimmed);
        }
        return trimmed;
    }

    @Override
    public PaymentOrder createOrder(long amountInr, String reference, Customer customer) {
        return createOrder(amountInr, reference, customer, null);
    }

    @Override
    public PaymentOrder createOrder(long amountInr, String reference, Customer customer, String returnPath) {
        String orderId = "dz_" + UUID.randomUUID();
        String customerId = customer != null && customer.id() != null && !customer.id().isBlank()
                ? customer.id()
                : sanitise(reference);
        String phone = customer != null && customer.phone() != null && !customer.phone().isBlank()
                ? customer.phone()
                : PLACEHOLDER_PHONE;
        String returnUrl = returnBase.isEmpty() || returnPath == null ? null : returnBase + returnPath;

        String sessionId = calls.track(ProviderCalls.CASHFREE, CREATE_ORDER,
                PLACEHOLDER_PHONE.equals(phone) ? null : phone, orderId, () -> {
                    OrderResponse response = cashfree.post(
                            "/pg/orders",
                            API_VERSION,
                            orderRequest(new OrderSpec(orderId, amountInr, reference,
                                    new Customer(customerId, phone), ttl.expiryFrom(Instant.now()), notifyUrl,
                                    returnUrl)),
                            OrderResponse.class);
                    if (response == null || response.payment_session_id() == null
                            || response.payment_session_id().isBlank()) {
                        throw new IllegalStateException(
                                "Cashfree returned no payment_session_id for order " + orderId);
                    }
                    return response.payment_session_id();
                });
        return new PaymentOrder(orderId, sessionId);
    }

    @Override
    public Optional<String> resumeSession(String orderId) {
        return resumable(cashfree.get("/pg/orders/" + orderId, API_VERSION, OrderResponse.class));
    }

    @Override
    public void terminate(String orderId) {
        calls.track(ProviderCalls.CASHFREE, TERMINATE, null, orderId, () -> {
            cashfree.patch("/pg/orders/" + orderId, API_VERSION, Map.of("order_status", "TERMINATED"),
                    OrderResponse.class);
        });
    }

    @Override
    public boolean paid(String orderId) {
        OrderResponse order = cashfree.get("/pg/orders/" + orderId, API_VERSION, OrderResponse.class);
        return order != null && "PAID".equals(order.order_status());
    }

    @Override
    public boolean lastAttemptFailed(String orderId) {
        return newestFailed(cashfree.get("/pg/orders/" + orderId + "/payments", API_VERSION, Payment[].class));
    }

    static boolean newestFailed(Payment[] payments) {
        if (payments == null || payments.length == 0
                || Arrays.stream(payments).anyMatch(p -> "SUCCESS".equals(p.payment_status()))) {
            return false;
        }
        Payment newest = Arrays.stream(payments)
                .max(Comparator.comparing(Payment::at, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElseThrow();
        return FAILED_ATTEMPTS.contains(newest.payment_status());
    }

    static Optional<String> resumable(OrderResponse order) {
        if (order == null || !"ACTIVE".equals(order.order_status())
                || order.payment_session_id() == null || order.payment_session_id().isBlank()) {
            return Optional.empty();
        }
        return Optional.of(order.payment_session_id());
    }

    @Override
    public String refund(String orderId, long amountInr, String refundId, String note) {
        String text = note == null || note.isBlank() ? "Refund" : note.strip();
        return calls.track(ProviderCalls.CASHFREE, REFUND, null, orderId, () -> {
            RefundResponse response = cashfree.post("/pg/orders/" + orderId + "/refunds", API_VERSION,
                    Map.of("refund_amount", amountInr, "refund_id", refundId,
                            "refund_note", text.length() > 100 ? text.substring(0, 100) : text),
                    RefundResponse.class);
            if (response == null || response.cf_refund_id() == null || response.cf_refund_id().isBlank()) {
                throw new IllegalStateException("Cashfree returned no cf_refund_id for refund " + refundId);
            }
            return response.cf_refund_id();
        });
    }

    @Override
    public Optional<String> findRefund(String orderId, String refundId) {
        try {
            RefundResponse response = cashfree.get("/pg/orders/" + orderId + "/refunds/" + refundId, API_VERSION,
                    RefundResponse.class);
            return response == null || response.cf_refund_id() == null || response.cf_refund_id().isBlank()
                    ? Optional.empty() : Optional.of(response.cf_refund_id());
        } catch (CashfreeClient.CashfreeException failed) {
            if (failed.getCause() instanceof HttpClientErrorException.NotFound) {
                return Optional.empty();
            }
            throw failed;
        }
    }

    record RefundResponse(String cf_refund_id, String refund_id, String refund_status) {
    }

    record OrderSpec(String orderId, long amountInr, String reference, Customer customer, Instant expiresAt,
            String notifyUrl, String returnUrl) {
    }

    static Map<String, Object> orderRequest(OrderSpec order) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("order_id", order.orderId());
        body.put("order_amount", order.amountInr());
        body.put("order_currency", "INR");
        body.put("order_note", order.reference());
        body.put("order_expiry_time", expiryFormat(order.expiresAt()));
        body.put("customer_details", Map.of(
                "customer_id", order.customer().id(),
                "customer_phone", order.customer().phone()));
        Map<String, Object> meta = new LinkedHashMap<>();
        if (order.notifyUrl() != null && !order.notifyUrl().isBlank()) {
            meta.put("notify_url", order.notifyUrl().trim());
        }
        if (order.returnUrl() != null) {
            meta.put("return_url", order.returnUrl());
        }
        if (!meta.isEmpty()) {
            body.put("order_meta", meta);
        }
        return body;
    }

    private static String expiryFormat(Instant expiresAt) {
        return DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
                expiresAt.truncatedTo(ChronoUnit.SECONDS).atOffset(ZoneOffset.UTC));
    }

    private static String sanitise(String reference) {
        String cleaned = reference == null ? "" : reference.replaceAll("[^A-Za-z0-9_-]", "_");
        return cleaned.isBlank() ? "guest_" + UUID.randomUUID() : cleaned;
    }

    record OrderResponse(String order_id, String payment_session_id, String order_status) {
    }

    record Payment(String payment_status, String payment_time) {
        Instant at() {
            return payment_time == null ? null : OffsetDateTime.parse(payment_time).toInstant();
        }
    }
}

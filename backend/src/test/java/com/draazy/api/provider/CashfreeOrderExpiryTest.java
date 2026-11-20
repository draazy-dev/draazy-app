package com.draazy.api.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.draazy.api.common.payments.CheckoutTtl;
import com.draazy.api.provider.cashfree.CashfreeProperties;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("D169 — the Cashfree order carries an expiry derived from the shared TTL")
class CashfreeOrderExpiryTest {
    private static final Instant NOW = Instant.parse("2026-03-14T09:30:00Z");

    private static final CheckoutTtl TTL = new CheckoutTtl(45);

    @Test
    @DisplayName("the expiry is the shared TTL's look-forward, not a number of its own")
    void theExpiryComesFromTheSharedTtl() {
        Instant sent = Instant.from(
                DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse((String) body().get("order_expiry_time")));

        assertThat(sent).isEqualTo(TTL.expiryFrom(NOW));
    }

    @Test
    @DisplayName("the order stops being payable when the sweep would retire the row")
    void theTwoWindowsCloseTogether() {
        Instant sent = Instant.from(
                DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse((String) body().get("order_expiry_time")));

        assertThat(TTL.cutoffFrom(sent)).isEqualTo(NOW);
    }

    @Test
    @DisplayName("the expiry is ISO-8601 UTC at seconds precision")
    void theExpiryIsFormattedForTheVendor() {
        assertThat(body().get("order_expiry_time")).isEqualTo("2026-03-14T10:15:00Z");
    }

    @Test
    @DisplayName("sub-second precision is truncated rather than sent")
    void nanosecondsAreTruncated() {
        Map<String, Object> body = CashfreePaymentGateway.orderRequest(order(
                Instant.parse("2026-03-14T10:15:00.123456789Z"), null));

        assertThat(body.get("order_expiry_time")).isEqualTo("2026-03-14T10:15:00Z");
    }

    @Test
    @DisplayName("the shortest allowed TTL still sends an expiry Cashfree accepts")
    void theClampedFloorClearsTheVendorMinimum() {
        Instant now = Instant.parse("2026-03-14T09:30:00.999Z");
        Instant arrivesAtVendor = now.plusSeconds(10);
        Map<String, Object> body = CashfreePaymentGateway.orderRequest(order(new CheckoutTtl(0).expiryFrom(now), null));
        Instant sent = Instant.from(DateTimeFormatter.ISO_OFFSET_DATE_TIME.parse((String) body.get("order_expiry_time")));

        assertThat(sent).isAfter(arrivesAtVendor.plus(Duration.ofMinutes(15)));
    }

    @Test
    @DisplayName("the fields the order already needed are still there")
    void theExistingFieldsSurvive() {
        Map<String, Object> body = body();

        assertThat(body.get("order_id")).isEqualTo("dz_1");
        assertThat(body.get("order_amount")).isEqualTo(2499L);
        assertThat(body.get("order_currency")).isEqualTo("INR");
        assertThat(body.get("order_note")).isEqualTo("sub_1");
        assertThat(body.get("customer_details"))
                .isEqualTo(Map.of("customer_id", "cust_1", "customer_phone", "9800000000"));
    }

    @Test
    @DisplayName("notify_url is omitted when unconfigured and sent when set")
    void theNotifyUrlIsOptional() {
        assertThat(body()).doesNotContainKey("order_meta");
        assertThat(CashfreePaymentGateway.orderRequest(order(TTL.expiryFrom(NOW), "   ")))
                .doesNotContainKey("order_meta");

        Map<String, Object> body = CashfreePaymentGateway.orderRequest(order(TTL.expiryFrom(NOW),
                "https://tunnel.example/webhooks/cashfree/payment"));

        assertThat(body.get("order_meta")).isEqualTo(
                Map.of("notify_url", "https://tunnel.example/webhooks/cashfree/payment"));
    }

    @Test
    @DisplayName("return_url rides in order_meta beside notify_url")
    void theReturnUrlIsSentWhenGiven() {
        Map<String, Object> body = CashfreePaymentGateway.orderRequest(order(TTL.expiryFrom(NOW),
                "https://tunnel.example/hook", "https://draazy.com/checkout?order_id={order_id}"));

        assertThat(body.get("order_meta")).isEqualTo(Map.of(
                "notify_url", "https://tunnel.example/hook",
                "return_url", "https://draazy.com/checkout?order_id={order_id}"));
    }

    @Test
    @DisplayName("a notify url that is not absolute https refuses to start")
    void aBadNotifyUrlIsABootFailure() {
        for (String rejected : new String[] {
                "http://tunnel.example/hook",
                "/webhooks/cashfree/payment",
                "https:///hook",
                "not a url"}) {
            assertThatThrownBy(() -> gatewayWithNotifyUrl(rejected))
                    .as("notify url %s", rejected)
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("absolute https URL");
        }
    }

    @Test
    @DisplayName("blank, absent and upper-case https all start cleanly")
    void agoodNotifyUrlIsAccepted() {
        for (String accepted : new String[] {
                null, "", "   ", "https://sandbox.draazy.com/api/webhooks/cashfree/payment",
                "HTTPS://sandbox.draazy.com/api/webhooks/cashfree/payment"}) {
            assertThatCode(() -> gatewayWithNotifyUrl(accepted))
                    .as("notify url %s", accepted)
                    .doesNotThrowAnyException();
        }
    }

    private static CashfreePaymentGateway gatewayWithNotifyUrl(String notifyUrl) {
        return new CashfreePaymentGateway(null, TTL,
                new CashfreeProperties(true, null, null, null, notifyUrl), null, "https://draazy.com");
    }

    private static Map<String, Object> body() {
        return CashfreePaymentGateway.orderRequest(order(TTL.expiryFrom(NOW), null));
    }

    private static CashfreePaymentGateway.OrderSpec order(Instant expiresAt, String notifyUrl) {
        return order(expiresAt, notifyUrl, null);
    }

    private static CashfreePaymentGateway.OrderSpec order(Instant expiresAt, String notifyUrl, String returnUrl) {
        return new CashfreePaymentGateway.OrderSpec("dz_1", 2499L, "sub_1",
                new PaymentGateway.Customer("cust_1", "9800000000"), expiresAt, notifyUrl, returnUrl);
    }
}

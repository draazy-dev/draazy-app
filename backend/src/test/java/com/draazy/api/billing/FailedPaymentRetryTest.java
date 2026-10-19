package com.draazy.api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.PaymentGateway;
import com.draazy.api.provider.cashfree.WebhookSignature;
import com.draazy.api.support.AbstractApiTest;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Cashfree keeps an order payable after a declined attempt, so the order stays ours to retry: cancelling it
 *  would refund a successful second attempt made in the same checkout. */
@DisplayName("A declined payment leaves the order open for a retry")
class FailedPaymentRetryTest extends AbstractApiTest {

    private static final String PAID_PLAN = "b1000000-0000-4000-8000-000000000006";

    /** The contact pack's price, so a success settles rather than tripping the amount guard. */
    private static final String WEBHOOK_AMOUNT = "199.00";

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired WebhookSignature webhookSignature;
    @MockitoSpyBean PaymentGateway gateway;

    @Test
    @DisplayName("after a decline the same key resumes the same pending order")
    void aDeclinedOrderIsResumedWithTheSameKey() throws Exception {
        User u = user("9877700101", "owner");
        String key = "plan-owner-plus";

        String first = subscribe(u, key);
        decline(field(first, "paymentRef"));

        String second = subscribe(u, key);

        assertThat(field(second, "id")).isEqualTo(field(first, "id"));
        assertThat(field(second, "paymentRef")).isEqualTo(field(first, "paymentRef"));
        assertThat(field(second, "paymentSessionId")).isNotBlank();
        assertThat(subscriptions.findByUserIdOrderByStartedAtDesc(u.getId()))
                .extracting(s -> s.getStatus())
                .containsExactly(SubscriptionStatuses.PENDING);
    }

    @Test
    @DisplayName("a successful retry after a decline activates the order instead of refunding it")
    void aSuccessAfterADeclineActivates() throws Exception {
        User u = user("9877700104", "owner");
        String orderId = field(subscribe(u, "plan-retry-paid"), "paymentRef");

        decline(orderId);
        deliverSigned(webhook(orderId, "SUCCESS"));

        var order = subscriptions.findByPaymentRef(orderId).orElseThrow();
        assertThat(order.getStatus()).isEqualTo(SubscriptionStatuses.ACTIVE);
        assertThat(order.getRefundDueAt()).isNull();
    }

    @Test
    @DisplayName("the order status is the owner's alone and reads closed once the order is cancelled")
    void orderStatusIsOwnerOnly() throws Exception {
        User owner = user("9877700102", "owner");
        User stranger = user("9877700103", "owner");
        String orderId = field(subscribe(owner, "plan-status"), "paymentRef");

        orderStatus(owner, orderId).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("pending"));
        orderStatus(stranger, orderId).andExpect(status().isNotFound());
        orderStatus(owner, "dz_unknown").andExpect(status().isNotFound());

        mvc.perform(post(Routes.Plans.CANCEL_SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNoContent());
        orderStatus(owner, orderId).andExpect(jsonPath("$.status").value("closed"));
    }

    @Test
    @DisplayName("cancelling terminates the gateway order, and a gateway refusal does not undo the cancel")
    void cancellingTerminatesTheOrder() throws Exception {
        User owner = user("9877700105", "owner");
        String orderId = field(subscribe(owner, "plan-terminate"), "paymentRef");
        doThrow(new IllegalStateException("gateway down")).when(gateway).terminate(orderId);

        mvc.perform(post(Routes.Plans.CANCEL_SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNoContent());

        verify(gateway).terminate(orderId);
        orderStatus(owner, orderId).andExpect(jsonPath("$.status").value("closed"));
    }

    private ResultActions orderStatus(User caller, String orderId) throws Exception {
        return mvc.perform(get(Routes.Plans.ORDER_STATUS, orderId)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private String subscribe(User caller, String key) throws Exception {
        return mvc.perform(post(Routes.Plans.SUBSCRIPTION)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planId\":\"" + PAID_PLAN + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Retry User " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    /** Every family is offered the event; only the one owning the order acts on it. */
    private void decline(String orderId) throws Exception {
        deliverSigned(webhook(orderId, "FAILED"));
    }

    private static String webhook(String orderId, String status) {
        String at = OffsetDateTime.now(ZoneOffset.ofHoursMinutes(5, 30)).withNano(0).toString();
        return "{\"type\":\"PAYMENT_" + status + "_WEBHOOK\",\"data\":{"
                + "\"order\":{\"order_id\":\"" + orderId + "\"},"
                + "\"payment\":{\"payment_status\":\"" + status + "\","
                + "\"payment_amount\":" + WEBHOOK_AMOUNT + ",\"payment_currency\":\"INR\","
                + "\"payment_time\":\"" + at + "\"}}}";
    }

    private void deliverSigned(String body) throws Exception {
        String ts = String.valueOf(System.currentTimeMillis());
        mvc.perform(post(Routes.Webhooks.CASHFREE_PAYMENT)
                        .header("x-webhook-timestamp", ts)
                        .header("x-webhook-signature", webhookSignature.sign(ts, body))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    private static String field(String body, String name) {
        int i = body.indexOf("\"" + name + "\":\"") + name.length() + 4;
        return body.substring(i, body.indexOf('"', i));
    }
}

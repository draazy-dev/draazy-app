package com.draazy.api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.billing.plan.TestPlanGrants;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.cashfree.WebhookSignature;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("A listing pass is bought for one of the caller's own listings")
class ListingPassPurchaseTest extends AbstractApiTest {

    private static final String LISTING_PASS = "b1000000-0000-4000-8000-000000000005";

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired WebhookSignature webhookSignature;
    @Autowired TestPlanGrants grants;

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Pass " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String status) {
        Property p = new Property(owner, "Pass flat", "rent", "apartment", 25000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("900"));
        p.setStatus(status);
        return properties.saveAndFlush(p);
    }

    private org.springframework.test.web.servlet.ResultActions buy(User u, String body) throws Exception {
        return mvc.perform(post(Routes.Plans.SUBSCRIPTION)
                .header(HttpHeaders.AUTHORIZATION, bearer(u))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private org.springframework.test.web.servlet.ResultActions buyPass(User u, Object propertyId) throws Exception {
        String property = propertyId == null ? "" : ",\"propertyId\":\"" + propertyId + "\"";
        return buy(u, "{\"planId\":\"" + LISTING_PASS + "\"" + property + "}");
    }

    private void deliverSuccess(String orderId) throws Exception {
        String paidAt = OffsetDateTime.now(ZoneId.of("Asia/Kolkata"))
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"));
        String body = "{\"type\":\"PAYMENT_SUCCESS_WEBHOOK\",\"data\":{"
                + "\"order\":{\"order_id\":\"" + orderId + "\"},"
                + "\"payment\":{\"payment_status\":\"SUCCESS\",\"payment_amount\":999.00,"
                + "\"payment_time\":\"" + paidAt + "\"}}}";
        String ts = String.valueOf(System.currentTimeMillis());
        mvc.perform(post(Routes.Webhooks.CASHFREE_PAYMENT)
                        .header("x-webhook-timestamp", ts)
                        .header("x-webhook-signature", webhookSignature.sign(ts, body))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a pass needs a property id")
    void aPassNeedsAProperty() throws Exception {
        buyPass(owner("9856600001"), null).andExpect(status().isUnprocessableEntity());
        buyPass(owner("9856600002"), "not-a-uuid").andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("somebody else's listing is a 404, never a pass for it")
    void aStrangersListingIsNotFound() throws Exception {
        User other = owner("9856600003");
        Property theirs = listing(owner("9856600004"), PropertyStatus.APPROVED);

        buyPass(other, theirs.getId()).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a rejected or archived listing cannot take a pass")
    void deadListingsAreRefused() throws Exception {
        User u = owner("9856600005");
        buyPass(u, listing(u, PropertyStatus.REJECTED).getId()).andExpect(status().isConflict());

        Property archived = listing(u, PropertyStatus.APPROVED);
        archived.archive("test");
        properties.saveAndFlush(archived);
        buyPass(u, archived.getId()).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("a listing that already holds an unexpired pass is refused a second one")
    void aCoveredListingIsRefused() throws Exception {
        User u = owner("9856600006");
        Property p = listing(u, PropertyStatus.APPROVED);
        grants.grantPass(u.getId(), p.getId(), Instant.now().plus(10, ChronoUnit.DAYS));

        buyPass(u, p.getId()).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("an expired pass can be replaced by a new one")
    void anExpiredPassCanBeRenewed() throws Exception {
        User u = owner("9856600007");
        Property p = listing(u, PropertyStatus.PAUSED);
        grants.grantPass(u.getId(), p.getId(), Instant.now().minus(1, ChronoUnit.DAYS));

        buyPass(u, p.getId()).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("the order is bound to the property, lasts sixty days, and brings a paused listing back")
    void activationResumesThePausedListingForSixtyDays() throws Exception {
        User u = owner("9856600008");
        listing(u, PropertyStatus.APPROVED);
        Property paused = listing(u, PropertyStatus.PAUSED);

        String created = buyPass(u, paused.getId())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value(SubscriptionStatuses.PENDING))
                .andExpect(jsonPath("$.propertyId").value(paused.getId().toString()))
                .andReturn().getResponse().getContentAsString();
        String orderId = com.jayway.jsonpath.JsonPath.read(created, "$.paymentRef");
        assertThat(properties.findById(paused.getId()).orElseThrow().getStatus())
                .isEqualTo(PropertyStatus.PAUSED);

        deliverSuccess(orderId);

        var pass = subscriptions.findByPaymentRef(orderId).orElseThrow();
        assertThat(pass.getPropertyId()).isEqualTo(paused.getId());
        assertThat(pass.getRenewsAt()).isAfter(Instant.now().plus(59, ChronoUnit.DAYS))
                .isBefore(Instant.now().plus(61, ChronoUnit.DAYS));
        assertThat(properties.findById(paused.getId()).orElseThrow().getStatus())
                .isEqualTo(PropertyStatus.APPROVED);
    }

    @Test
    @DisplayName("a retired plan can no longer be bought")
    void aRetiredPlanIsNotFound() throws Exception {
        buy(owner("9856600009"), "{\"planId\":\"b1000000-0000-4000-8000-000000000002\"}")
                .andExpect(status().isNotFound());
    }
}

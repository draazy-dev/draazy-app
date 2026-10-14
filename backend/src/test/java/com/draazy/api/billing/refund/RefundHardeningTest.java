package com.draazy.api.billing.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

@DisplayName("Refund hardening: disputes, pause gaming, frozen terms and the desk list")
class RefundHardeningTest extends RefundTestBase {

    private void dispute(String type, String disputeId, String status, Subscription order) throws Exception {
        webhook("{\"type\":\"" + type + "\",\"data\":{\"dispute\":{\"dispute_id\":\"" + disputeId
                + "\",\"dispute_status\":\"" + status + "\",\"dispute_amount\":199.00},"
                + "\"order_details\":{\"order_id\":\"" + order.getPaymentRef() + "\"}}}");
    }

    private void gap(Property listing, Instant left, Instant returned) {
        jdbc.update("insert into property_live_gaps (property_id, left_live_at, returned_live_at) values (?, ?, ?)",
                listing.getId(), Timestamp.from(left), returned == null ? null : Timestamp.from(returned));
    }

    private String desk(User staff, String status) throws Exception {
        return mvc.perform(get(Routes.Refunds.DESK).param("status", status)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private Instant renewsAt(Subscription order) {
        return jdbc.queryForObject("select renews_at from subscriptions where id = ?", Timestamp.class, order.getId())
                .toInstant();
    }

    private void frozenFor(Subscription order, int days) {
        jdbc.update("update subscriptions set frozen_at = ? where id = ?",
                Timestamp.from(Instant.now().minus(days, ChronoUnit.DAYS)), order.getId());
    }

    @Test
    void aRefundCannotBeRejectedWhileAChargebackIsOpen() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", null).andExpect(status().isOk());
        dispute("DISPUTE_CREATED", "H-1", "DISPUTE_CREATED", pack);

        decide(desk, refundRequestOf(pack.getId()), "reject", "{\"reason\":\"no\"}").andExpect(status().isConflict());

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("refund-review");
    }

    @Test
    void aLostDisputeRevokesWhateverStatusTheOrderIsIn() throws Exception {
        User buyer = user("buyer");
        Subscription active = pack(buyer, 20);
        Subscription inReview = pack(buyer, 1);
        askRefund(buyer, inReview.getId(), "k-2", null).andExpect(status().isOk());
        dispute("DISPUTE_CREATED", "H-2", "DISPUTE_CREATED", active);
        dispute("DISPUTE_CREATED", "H-3", "DISPUTE_CREATED", inReview);

        dispute("DISPUTE_CLOSED", "H-2", "DISPUTE_MERCHANT_LOST", active);
        dispute("DISPUTE_CLOSED", "H-3", "DISPUTE_MERCHANT_LOST", inReview);

        assertThat(subscriptionStatus(active.getId())).isEqualTo("cancelled");
        assertThat(subscriptionStatus(inReview.getId())).isEqualTo("cancelled");
    }

    @Test
    void aDisputeWonOnAnOrderUnderRefundReviewLeavesItUnderReview() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-3", null).andExpect(status().isOk());
        dispute("DISPUTE_CREATED", "H-4", "DISPUTE_CREATED", pack);

        dispute("DISPUTE_CLOSED", "H-4", "DISPUTE_MERCHANT_WON", pack);

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("refund-review");
    }

    @Test
    void aPauseInsideTheGuaranteeWindowMakesThePassIneligible() throws Exception {
        User owner = user("owner");
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);
        gap(listing, pass.getStartedAt().plus(2, ChronoUnit.DAYS), pass.getStartedAt().plus(3, ChronoUnit.DAYS));

        payments(owner, null).andExpect(jsonPath("$[0].refund.eligible").value(false))
                .andExpect(jsonPath("$[0].refund.reason").value("listing_paused"));
        askRefund(owner, pass.getId(), "k-4", null).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.reason").value("listing_paused"));
    }

    @Test
    void aPauseAfterTheWindowDoesNotMatter() throws Exception {
        User owner = user("owner");
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);
        gap(listing, pass.getStartedAt().plus(8, ChronoUnit.DAYS), pass.getStartedAt().plus(9, ChronoUnit.DAYS));

        payments(owner, null).andExpect(jsonPath("$[0].refund.eligible").value(true));
    }

    @Test
    void aPauseThatClosedJustAfterTheStartIsForgiven() throws Exception {
        User owner = user("owner");
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);
        gap(listing, pass.getStartedAt().minus(3, ChronoUnit.DAYS), pass.getStartedAt().plusSeconds(20));

        payments(owner, null).andExpect(jsonPath("$[0].refund.eligible").value(true));
    }

    @Test
    void anEnquiryBetweenTheWindowAndTheDecisionIsCaughtAtApproval() throws Exception {
        User owner = user("owner");
        User desk = refundStaff();
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);
        askRefund(owner, pass.getId(), "k-5", null).andExpect(status().isOk());
        enquiry(listing, Instant.now(), 0);

        decide(desk, refundRequestOf(pass.getId()), "approve", "").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("refund_not_eligible"));
    }

    @Test
    void aPauseRecordedAfterTheRequestIsCaughtAtApprovalAndShownOnTheDesk() throws Exception {
        User owner = user("owner");
        User desk = refundStaff();
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);
        askRefund(owner, pass.getId(), "k-6", null).andExpect(status().isOk());
        gap(listing, pass.getStartedAt().plus(1, ChronoUnit.DAYS), pass.getStartedAt().plus(2, ChronoUnit.DAYS));

        String body = desk(desk, "pending_review");
        assertThat((Boolean) JsonPath.read(body, "$.content[0].signals.pausedDuringWindow")).isTrue();
        decide(desk, refundRequestOf(pass.getId()), "approve", "").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.reason").value("listing_paused"));
    }

    @Test
    void theDeskComputesSignalsOnlyForRowsStillPendingReview() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-7", null).andExpect(status().isOk());

        String pending = desk(desk, "pending_review");
        assertThat((Object) JsonPath.read(pending, "$.content[0].signals")).isNotNull();

        decide(desk, refundRequestOf(pack.getId()), "approve", "").andExpect(status().isOk());
        String approved = desk(desk, "approved");
        assertThat((List<?>) JsonPath.read(approved, "$.content[?(@.signals != null)]")).isEmpty();
        assertThat((List<?>) JsonPath.read(approved, "$.content")).isNotEmpty();
    }

    @Test
    void aRejectedRefundPushesTheTermOutByTheTimeItWasFrozen() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-8", null).andExpect(status().isOk());
        frozenFor(pack, 3);
        Instant before = renewsAt(pack);

        decide(desk, refundRequestOf(pack.getId()), "reject", "{\"reason\":\"not now\"}").andExpect(status().isOk());

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");
        assertThat(renewsAt(pack)).isBetween(before.plus(3, ChronoUnit.DAYS).minusSeconds(60),
                before.plus(3, ChronoUnit.DAYS).plusSeconds(60));
    }

    @Test
    void aTermThatWouldStillHaveEndedExpiresInsteadOfComingBack() throws Exception {
        User owner = user("owner");
        User desk = refundStaff();
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);
        askRefund(owner, pass.getId(), "k-9", null).andExpect(status().isOk());
        frozenFor(pass, 3);
        jdbc.update("update subscriptions set renews_at = ? where id = ?",
                Timestamp.from(Instant.now().minus(10, ChronoUnit.DAYS)), pass.getId());

        decide(desk, refundRequestOf(pass.getId()), "reject", "{\"reason\":\"no\"}").andExpect(status().isOk());

        assertThat(subscriptionStatus(pass.getId())).isEqualTo("expired");
    }

    @Test
    void aDisputeWonPushesTheTermOutByTheTimeItWasFrozen() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 20);
        dispute("DISPUTE_CREATED", "H-5", "DISPUTE_CREATED", pack);
        frozenFor(pack, 4);
        Instant before = renewsAt(pack);

        dispute("DISPUTE_CLOSED", "H-5", "DISPUTE_MERCHANT_WON", pack);

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");
        assertThat(renewsAt(pack)).isBetween(before.plus(4, ChronoUnit.DAYS).minusSeconds(60),
                before.plus(4, ChronoUnit.DAYS).plusSeconds(60));
    }

    @Test
    void aDisputedUsedPackDoesNotDrainTheBuyersOtherPack() throws Exception {
        User buyer = user("buyer");
        Subscription disputed = pack(buyer, 20);
        pack(buyer, 1);
        exhaustFreeContacts(buyer);
        User owner = user("owner");
        for (int i = 0; i < 3; i++) {
            contactRequests.saveAndFlush(new com.draazy.api.leads.contact.ContactRequest(
                    listing(owner).getId(), buyer.getId(), null));
        }
        int before = remaining(buyer);

        dispute("DISPUTE_CREATED", "H-6", "DISPUTE_CREATED", disputed);

        assertThat(subscriptionStatus(disputed.getId())).isEqualTo("disputed");
        assertThat(remaining(buyer)).isEqualTo(before);
    }
}

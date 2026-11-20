package com.draazy.api.billing.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

@DisplayName("A refund is a request that freezes the order until staff decide it")
class RefundRequestFlowTest extends RefundTestBase {

    @Test
    void anUnusedPackInsideItsWindowIsEligible() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 2);

        payments(buyer, null).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(pack.getId().toString()))
                .andExpect(jsonPath("$[0].kind").value("contact_pack"))
                .andExpect(jsonPath("$[0].status").value("paid"))
                .andExpect(jsonPath("$[0].invoiceNo").value(org.hamcrest.Matchers.startsWith("INV-FY")))
                .andExpect(jsonPath("$[0].refund.eligible").value(true))
                .andExpect(jsonPath("$[0].refund.reason").value("pack_unused"))
                .andExpect(jsonPath("$[0].refund.amount").value(pack.getAmount()));
    }

    @Test
    void aPackWithOneContactDrawnFromItIsNotEligible() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 2);
        exhaustFreeContacts(buyer);
        contactRequests.saveAndFlush(new com.draazy.api.leads.contact.ContactRequest(
                listing(user("owner")).getId(), buyer.getId(), null));
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);

        assertThat((java.util.List<String>) paymentField(buyer, pack.getId(), "refund.reason"))
                .containsExactly("not_eligible_used");
        askRefund(buyer, pack.getId(), "k-used", null).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("refund_not_eligible"))
                .andExpect(jsonPath("$.reason").value("not_eligible_used"));
        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");
    }

    @Test
    void aPackOlderThanItsWindowIsNotEligible() throws Exception {
        User buyer = user("buyer");
        pack(buyer, 8);

        payments(buyer, null).andExpect(jsonPath("$[0].refund.eligible").value(false))
                .andExpect(jsonPath("$[0].refund.reason").value("window_closed"));
    }

    @Test
    void requestingFreezesThePackAndTellsTheDeskButNotOtherStaff() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        User other = otherStaff();
        Subscription pack = pack(buyer, 1);
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS * 2);

        askRefund(buyer, pack.getId(), "k-1", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("refund_pending"));

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("refund-review");
        assertThat(remaining(buyer)).as("the pack's contacts are unusable while it is reviewed").isEqualTo(FREE_CONTACTS);
        assertThat(notes(desk, "refund.requested")).isEqualTo(1);
        assertThat(notes(other, "refund.requested")).isZero();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'refund.requested' and entity_id = ?",
                Long.class, refundRequestOf(pack.getId()).toString())).isEqualTo(1);
    }

    @Test
    void theSameKeyReplaysAndAnotherKeyIsAlreadyRequested() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", null).andExpect(status().isOk());

        askRefund(buyer, pack.getId(), "k-1", null).andExpect(status().isOk());
        askRefund(buyer, pack.getId(), "k-2", null).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.reason").value("already_requested"));

        assertThat(jdbc.queryForObject("select count(*) from refund_requests where subscription_id = ?", Long.class,
                pack.getId())).isEqualTo(1);
    }

    @Test
    void aRequestNeedsAnIdempotencyKey() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);

        askRefund(buyer, pack.getId(), null, null).andExpect(status().isUnprocessableEntity());
        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");
    }

    @Test
    void nobodyCanRefundAnotherCustomersOrder() throws Exception {
        Subscription pack = pack(user("buyer"), 1);

        askRefund(user("buyer"), pack.getId(), "k-1", null).andExpect(status().isNotFound());
    }

    @Test
    void rejectingNeedsAReasonThenRestoresThePack() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", null);
        UUID request = refundRequestOf(pack.getId());

        decide(desk, request, "reject", "{}").andExpect(status().isUnprocessableEntity());
        decide(desk, request, "reject", "{\"reason\":\"  \"}").andExpect(status().isUnprocessableEntity());
        decide(desk, request, "reject", "{\"reason\":\"Used the contacts\"}").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("rejected"));

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS * 2);
        assertThat(notes(buyer, "refund.decided")).isEqualTo(1);
        assertThat(paymentField(buyer, pack.getId(), "status").toString()).contains("refund_rejected");
        decide(desk, request, "approve", "").andExpect(status().isConflict());
    }

    @Test
    void approvingRevokesThePackForGoodAndQueuesTheMoneyOnce() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", null);
        UUID request = refundRequestOf(pack.getId());

        decide(desk, request, "approve", "").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("approved"));
        decide(desk, request, "approve", "").andExpect(status().isConflict());
        decide(desk, request, "reject", "{\"reason\":\"late\"}").andExpect(status().isConflict());

        Subscription after = subscriptionRow(pack.getId());
        assertThat(after.getStatus()).isEqualTo("refunded");
        assertThat(after.getRefundDueAt()).isNotNull();
        assertThat(after.getRefundAmount()).isEqualTo(pack.getAmount());
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);
        assertThat(notes(buyer, "refund.decided")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'refund.approved' and entity_id = ?",
                Long.class, request.toString())).isEqualTo(1);
    }

    @Test
    void approvalRechecksTheFactsAsTheyWereWhenTheCustomerAsked() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", null);

        jdbc.update("update refund_requests set created_at = ? where subscription_id = ?",
                java.sql.Timestamp.from(Instant.now().plus(20, ChronoUnit.DAYS)), pack.getId());
        em.clear();
        decide(desk, refundRequestOf(pack.getId()), "approve", "").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("refund_not_eligible"));
        assertThat(subscriptionStatus(pack.getId())).isEqualTo("refund-review");
    }

    @Test
    void aSlowReviewDoesNotTurnAValidRequestIntoALateOne() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", null);

        jdbc.update("update subscriptions set started_at = ? where id = ?",
                java.sql.Timestamp.from(Instant.now().minus(10, ChronoUnit.DAYS)), pack.getId());
        jdbc.update("update refund_requests set created_at = ? where subscription_id = ?",
                java.sql.Timestamp.from(Instant.now().minus(5, ChronoUnit.DAYS)), pack.getId());
        em.clear();

        decide(desk, refundRequestOf(pack.getId()), "approve", "").andExpect(status().isOk());
    }

    @Test
    void aPassWithNoEnquiriesIsClaimableAfterItsFirstWeek() throws Exception {
        User owner = user("owner");
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);

        payments(owner, null).andExpect(jsonPath("$[0].kind").value("listing_pass"))
                .andExpect(jsonPath("$[0].propertyId").value(listing.getId().toString()))
                .andExpect(jsonPath("$[0].refund.eligible").value(true))
                .andExpect(jsonPath("$[0].refund.reason").value("pass_no_enquiries"))
                .andExpect(jsonPath("$[0].refund.until").exists());
        assertThat(pass.getAmount()).isPositive();
    }

    @Test
    void aPassIsNotClaimableBeforeTheGuaranteeWindowEnds() throws Exception {
        User owner = user("owner");
        pass(owner, listing(owner), 3);

        payments(owner, null).andExpect(jsonPath("$[0].refund.eligible").value(false))
                .andExpect(jsonPath("$[0].refund.reason").value("window_not_open"))
                .andExpect(jsonPath("$[0].refund.from").exists());
    }

    @Test
    void aPassIsNotClaimableAWeekAfterTheWindowEnded() throws Exception {
        User owner = user("owner");
        pass(owner, listing(owner), 20);

        payments(owner, null).andExpect(jsonPath("$[0].refund.reason").value("window_closed"));
    }

    @Test
    void onePassEnquiryInTheFirstWeekEndsTheGuarantee() throws Exception {
        User owner = user("owner");
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);
        enquiry(listing, pass.getStartedAt(), 2);

        payments(owner, null).andExpect(jsonPath("$[0].refund.eligible").value(false))
                .andExpect(jsonPath("$[0].refund.reason").value("not_eligible_used"));
    }

    @Test
    void anEnquiryAfterTheFirstWeekStillCountsAtClaimTime() throws Exception {
        User owner = user("owner");
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);
        enquiry(listing, pass.getStartedAt(), 9);

        payments(owner, null).andExpect(jsonPath("$[0].refund.eligible").value(false))
                .andExpect(jsonPath("$[0].refund.reason").value("not_eligible_used"));
    }

    @Test
    void requestingAPassRefundPausesItsListingAndRejectingBringsItBack() throws Exception {
        User owner = user("owner");
        User desk = refundStaff();
        listing(owner);
        Property listing = listing(owner);
        Subscription pass = pass(owner, listing, 10);

        askRefund(owner, pass.getId(), "k-1", null).andExpect(status().isOk());

        assertThat(subscriptionStatus(pass.getId())).isEqualTo("refund-review");
        assertThat(listingStatus(listing)).isEqualTo("paused");
        decide(desk, refundRequestOf(pass.getId()), "reject", "{\"reason\":\"Fine to stay\"}").andExpect(status().isOk());
        assertThat(subscriptionStatus(pass.getId())).isEqualTo("active");
        assertThat(listingStatus(listing)).isEqualTo("approved");
    }

    @Test
    void theGuaranteeIsOncePerYearAcrossAccountsSharingADevice() throws Exception {
        User first = user("owner");
        pass(first, listing(first), 10);
        UUID firstPass = jdbc.queryForObject("select id from subscriptions where user_id = ?", UUID.class, first.getId());
        askRefund(first, firstPass, "k-1", "device-shared-1").andExpect(status().isOk());

        User second = user("owner");
        pass(second, listing(second), 10);
        UUID secondPass = jdbc.queryForObject("select id from subscriptions where user_id = ?", UUID.class, second.getId());

        payments(second, "device-shared-1").andExpect(jsonPath("$[0].refund.eligible").value(false))
                .andExpect(jsonPath("$[0].refund.reason").value("guarantee_used_recently"));
        payments(second, "another-device").andExpect(jsonPath("$[0].refund.eligible").value(true));
        askRefund(second, secondPass, "k-2", "device-shared-1").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.reason").value("guarantee_used_recently"));
    }

    @Test
    void theSameAccountCannotClaimTheGuaranteeTwiceInAYear() throws Exception {
        User owner = user("owner");
        Subscription first = pass(owner, listing(owner), 10);
        askRefund(owner, first.getId(), "k-1", null).andExpect(status().isOk());
        Subscription second = pass(owner, listing(owner), 10);

        askRefund(owner, second.getId(), "k-2", null).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.reason").value("guarantee_used_recently"));
    }

    @Test
    void aDeviceIdLongerThanTheContractIsIgnoredNotRefused() throws Exception {
        User buyer = user("buyer");
        pack(buyer, 1);

        payments(buyer, "x".repeat(65)).andExpect(status().isOk());
    }

    @Test
    void theDeskListsRequestsWithSignalsAndAutomaticRefundsAndItsCounts() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", "dev-desk");
        User owner = user("owner");
        Subscription auto = pass(owner, listing(owner), 1);
        jdbc.update("update subscriptions set refund_due_at = now(), status = 'cancelled' where id = ?", auto.getId());

        mvc.perform(get(Routes.Refunds.DESK).param("status", "pending_review").param("counts", "true")
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(refundRequestOf(pack.getId()).toString()))
                .andExpect(jsonPath("$.content[0].status").value("pending_review"))
                .andExpect(jsonPath("$.content[0].kind").value("contact_pack"))
                .andExpect(jsonPath("$.content[0].signals.contactsUsed").value(0))
                .andExpect(jsonPath("$.content[0].signals.refunds12m").exists())
                .andExpect(jsonPath("$.content[0].signals.linkedAccounts").exists())
                .andExpect(jsonPath("$.content[0].signals.enquiries").exists());
        mvc.perform(get(Routes.Refunds.DESK).param("status", "auto").header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(auto.getId().toString()))
                .andExpect(jsonPath("$.content[0].status").value("auto"));
        mvc.perform(get(Routes.Refunds.DESK).param("status", "bogus").header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void daysNarrowsTheDeskByRequestedAtForCustomerRequestsAndAutomaticRefunds() throws Exception {
        User desk = refundStaff();
        User oldBuyer = user("buyer");
        User freshBuyer = user("buyer");
        Subscription oldPack = pack(oldBuyer, 1);
        Subscription freshPack = pack(freshBuyer, 1);
        askRefund(oldBuyer, oldPack.getId(), "k-old", null).andExpect(status().isOk());
        askRefund(freshBuyer, freshPack.getId(), "k-fresh", null).andExpect(status().isOk());
        UUID oldRequest = refundRequestOf(oldPack.getId());
        UUID freshRequest = refundRequestOf(freshPack.getId());
        jdbc.update("update refund_requests set created_at = ? where id = ?", yesterdayLateIst(), oldRequest);

        assertNarrowed(desk, "pending_review", oldRequest, freshRequest);

        User owner = user("owner");
        Subscription oldAuto = pass(owner, listing(owner), 1);
        Subscription freshAuto = pass(owner, listing(owner), 1);
        jdbc.update("update subscriptions set refund_due_at = ?, status = 'cancelled' where id = ?",
                yesterdayLateIst(), oldAuto.getId());
        jdbc.update("update subscriptions set refund_due_at = now(), status = 'cancelled' where id = ?",
                freshAuto.getId());

        assertNarrowed(desk, "auto", oldAuto.getId(), freshAuto.getId());
    }

    private void assertNarrowed(User desk, String status, UUID old, UUID fresh) throws Exception {
        assertThat(deskJson(desk, status, "1")).contains(fresh.toString()).doesNotContain(old.toString());
        assertThat(deskJson(desk, status, "7")).contains(fresh.toString(), old.toString());
        assertThat(deskJson(desk, status, null)).contains(fresh.toString(), old.toString());
    }

    private String deskJson(User desk, String status, String days) throws Exception {
        var request = get(Routes.Refunds.DESK).param("status", status).param("size", "100")
                .header(HttpHeaders.AUTHORIZATION, bearer(desk));
        if (days != null) {
            request.param("days", days);
        }
        return mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static java.sql.Timestamp yesterdayLateIst() {
        Instant midnight = java.time.LocalDate.now(PlatformTime.IST).atStartOfDay(PlatformTime.IST).toInstant();
        return java.sql.Timestamp.from(midnight.minus(1, ChronoUnit.MINUTES));
    }

    @Test
    void onlyTheRefundsDeskAndAdminsMayUseTheDesk() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", null);
        UUID request = refundRequestOf(pack.getId());

        mvc.perform(get(Routes.Refunds.DESK).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isForbidden());
        mvc.perform(get(Routes.Refunds.DESK).header(HttpHeaders.AUTHORIZATION, bearer(otherStaff())))
                .andExpect(status().isForbidden());
        decide(otherStaff(), request, "approve", "").andExpect(status().isForbidden());
        decide(user("admin"), request, "approve", "").andExpect(status().isOk());
    }

    private String listingStatus(Property listing) {
        return jdbc.queryForObject("select status from properties where id = ?", String.class, listing.getId());
    }
}
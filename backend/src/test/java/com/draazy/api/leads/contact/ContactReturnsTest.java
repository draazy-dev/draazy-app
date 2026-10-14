package com.draazy.api.leads.contact;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.entitlement.EntitlementService;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("A contact comes back when the owner declines, never replies, or the listing closes")
class ContactReturnsTest extends AbstractApiTest {

    private static final int FREE_CONTACTS = 15;

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired ContactRequestRepository contactRequests;
    @Autowired EntitlementService entitlements;
    @Autowired ContactReturns returns;
    @Autowired EntityManager em;

    private int seq;

    private User user(String role) {
        User u = new User("9830" + String.format("%06d", ++seq), role);
        u.setName("Returns " + seq);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "Returns flat " + (++seq), "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private org.springframework.test.web.servlet.ResultActions ask(User buyer, Property p) throws Exception {
        return mvc.perform(post(Routes.Contacts.REQUEST).header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                .contentType(MediaType.APPLICATION_JSON).content("{\"propertyId\":\"" + p.getId() + "\"}"));
    }

    private int remaining(User buyer) {
        em.flush();
        em.clear();
        return entitlements.contactsRemaining(buyer.getId()).orElseThrow();
    }

    private ContactRequest row(User buyer, Property p) {
        em.flush();
        em.clear();
        return contactRequests.findByRequesterIdAndPropertyId(buyer.getId(), p.getId()).orElseThrow();
    }

    private void age(User buyer, Property p, int days) {
        jdbc.update("update contact_requests set created_at = ? where requester_id = ? and property_id = ?",
                java.sql.Timestamp.from(Instant.now().minus(days, ChronoUnit.DAYS)), buyer.getId(), p.getId());
    }

    private void respond(User owner, ContactRequest request, String outcome) throws Exception {
        mvc.perform(patch(Routes.MeContactRequests.BY_ID, request.getId())
                .header(HttpHeaders.AUTHORIZATION, bearer(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + outcome + "\"}")).andExpect(status().isOk());
    }

    private long notes(User seeker) {
        return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = 'contact.returned'",
                Long.class, seeker.getId());
    }

    @Test
    void anOpenRequestSpendsOneContact() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        ask(buyer, listing(owner)).andExpect(status().isOk());

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void aDeclineGivesTheContactBackAndTellsTheSeeker() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);
        ask(buyer, p);

        respond(owner, row(buyer, p), "declined");

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);
        assertThat(notes(buyer)).isEqualTo(1);
    }

    @Test
    void askingAgainAfterADeclineCannotFarmReturns() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);
        ask(buyer, p);
        respond(owner, row(buyer, p), "declined");

        ask(buyer, p).andExpect(status().isOk());

        assertThat(row(buyer, p).getStatus()).isEqualTo(ContactRequestStatuses.DECLINED);
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);
    }

    @Test
    void anApprovedRequestKeepsCountingEvenOnAClosedListing() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);
        ask(buyer, p);
        respond(owner, row(buyer, p), "approved");

        jdbc.update("update properties set status = 'rented' where id = ?", p.getId());

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void aPendingRequestKeepsCountingWhenItsListingCloses() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);
        ask(buyer, p);

        jdbc.update("update properties set status = 'rented' where id = ?", p.getId());

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void pendingRequestsOnClosedListingsStillFillThePendingCap() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        for (int i = 0; i < 10; i++) {
            Property p = listing(owner);
            ask(buyer, p).andExpect(status().isOk());
            jdbc.update("update properties set archived = true where id = ?", p.getId());
        }

        ask(buyer, listing(owner)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("contact_pending_limit"));
    }

    @Test
    void aRequestOnAClosedListingIsRefusedAsNotLiveAndOnAHiddenOneAsNotFound() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property paused = listing(owner);
        jdbc.update("update properties set status = 'paused' where id = ?", paused.getId());
        Property rented = listing(owner);
        jdbc.update("update properties set status = 'rented' where id = ?", rented.getId());
        Property archived = listing(owner);
        jdbc.update("update properties set archived = true where id = ?", archived.getId());
        Property pending = listing(owner);
        jdbc.update("update properties set status = 'pending' where id = ?", pending.getId());
        Property ofSuspended = listing(user("owner"));
        jdbc.update("update users set status = 'suspended' where id = ?", ofSuspended.getOwner().getId());
        em.clear();

        ask(buyer, paused).andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("listing_not_live"));
        ask(buyer, rented).andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("listing_not_live"));
        ask(buyer, archived).andExpect(status().isNotFound());
        ask(buyer, pending).andExpect(status().isNotFound());
        ask(buyer, ofSuspended).andExpect(status().isNotFound());
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);
    }

    @Test
    void anOwnerCannotApproveARequestWhileTheListingIsNotLiveButCanStillDecline() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);
        ask(buyer, p);
        jdbc.update("update properties set status = 'rented' where id = ?", p.getId());
        ContactRequest request = row(buyer, p);

        mvc.perform(patch(Routes.MeContactRequests.BY_ID, request.getId())
                .header(HttpHeaders.AUTHORIZATION, bearer(owner)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"approved\"}")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("listing_not_live"));
        assertThat(row(buyer, p).getStatus()).isEqualTo(ContactRequestStatuses.PENDING);

        respond(owner, request, "declined");
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);
    }

    @Test
    void renewingALapsedRequestKeepsTheOriginalEnquiryTime() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);
        ask(buyer, p);
        age(buyer, p, 9);
        Instant original = Instant.now().minus(9, ChronoUnit.DAYS);
        jdbc.update("update contact_requests set enquired_at = ? where requester_id = ? and property_id = ?",
                java.sql.Timestamp.from(original), buyer.getId(), p.getId());

        ask(buyer, p).andExpect(status().isOk());

        Instant after = jdbc.queryForObject("select enquired_at from contact_requests where requester_id = ? and property_id = ?",
                java.sql.Timestamp.class, buyer.getId(), p.getId()).toInstant();
        assertThat(after).isBefore(original.plusSeconds(1));
        assertThat(contactRequests.countEnquiredBetween(p.getId(), original.minusSeconds(60), original.plusSeconds(60)))
                .isEqualTo(1);
    }

    @Test
    void aPendingRequestKeepsCountingWhenItsOwnerIsSuspended() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        ask(buyer, listing(owner));

        jdbc.update("update users set status = 'suspended' where id = ?", owner.getId());

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void aSilentOwnerReturnsTheContactAfterTheReplyWindowAndTheSweepStoresIt() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);
        ask(buyer, p);

        age(buyer, p, 6);
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);

        age(buyer, p, 8);
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);

        assertThat(returns.expireOverdue(Instant.now())).isEqualTo(1);
        assertThat(row(buyer, p).getStatus()).isEqualTo(ContactRequestStatuses.EXPIRED);
        assertThat(notes(buyer)).isEqualTo(1);
        assertThat(returns.expireOverdue(Instant.now())).isZero();
        assertThat(notes(buyer)).isEqualTo(1);
    }

    @Test
    void renewingALapsedRequestIsCheckedAgainstTheAllowance() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property lapsed = listing(owner);
        ask(buyer, lapsed);
        age(buyer, lapsed, 9);
        for (int i = 0; i < FREE_CONTACTS; i++) {
            Property other = listing(owner);
            ask(buyer, other).andExpect(status().isOk());
            respond(owner, row(buyer, other), "approved");
        }
        assertThat(remaining(buyer)).isZero();

        ask(buyer, lapsed).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.error").value("contact_quota_exhausted"));
        assertThat(row(buyer, lapsed).getStatus()).isEqualTo(ContactRequestStatuses.PENDING);
    }

    @Test
    void renewingALapsedRequestSpendsAContactAgainWhenThereIsRoom() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property lapsed = listing(owner);
        ask(buyer, lapsed);
        age(buyer, lapsed, 9);
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);

        ask(buyer, lapsed).andExpect(status().isOk());

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void anEleventhOpenRequestIsRefusedWithThePendingLimit() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        for (int i = 0; i < 10; i++) {
            ask(buyer, listing(owner)).andExpect(status().isOk());
        }

        ask(buyer, listing(owner)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("contact_pending_limit"));
    }

    @Test
    void answeredRequestsFreeAPendingSlot() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property first = listing(owner);
        ask(buyer, first);
        for (int i = 0; i < 9; i++) {
            ask(buyer, listing(owner)).andExpect(status().isOk());
        }
        respond(owner, row(buyer, first), "declined");

        ask(buyer, listing(owner)).andExpect(status().isOk());
    }
}

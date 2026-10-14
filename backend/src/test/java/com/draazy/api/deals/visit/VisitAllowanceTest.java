package com.draazy.api.deals.visit;

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
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("A visit spends an owner contact from the same allowance as a contact request")
class VisitAllowanceTest extends AbstractApiTest {

    private static final int FREE_CONTACTS = 15;

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired EntitlementService entitlements;
    @Autowired EntityManager em;

    private int seq;

    private User user(String role) {
        User u = new User("9831" + String.format("%06d", ++seq), role);
        u.setName("Allowance " + seq);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "Allowance flat " + (++seq), "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private ResultActions visit(User visitor, Property p) throws Exception {
        String slot = Instant.now().plus(2, ChronoUnit.DAYS).toString();
        return mvc.perform(post(Routes.Visits.BASE).header(HttpHeaders.AUTHORIZATION, bearer(visitor))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"propertyId\":\"" + p.getId() + "\",\"slot\":\"" + slot + "\"}"));
    }

    private String book(User visitor, Property p) throws Exception {
        return visit(visitor, p).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()
                .replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");
    }

    private void setStatus(User caller, String visitId, String to) throws Exception {
        mvc.perform(patch(Routes.Visits.STATUS.replace("{id}", visitId)).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"" + to + "\"}"))
                .andExpect(status().isOk());
    }

    private ResultActions ask(User buyer, Property p) throws Exception {
        return mvc.perform(post(Routes.Contacts.REQUEST).header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                .contentType(MediaType.APPLICATION_JSON).content("{\"propertyId\":\"" + p.getId() + "\"}"));
    }

    private int remaining(User buyer) {
        em.flush();
        em.clear();
        return entitlements.contactsRemaining(buyer.getId()).orElseThrow();
    }

    @Test
    void aVisitSpendsOneContactAndContactingThatOwnerAfterwardsIsFree() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);

        visit(buyer, p).andExpect(status().isCreated());
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);

        ask(buyer, p).andExpect(status().isOk());
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void visitingAnOwnerAlreadyContactedIsFree() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property p = listing(owner);
        ask(buyer, p).andExpect(status().isOk());

        visit(buyer, p).andExpect(status().isCreated());

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void aCancelledVisitGivesTheContactBack() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        String id = book(buyer, listing(owner));

        setStatus(buyer, id, "cancelled");

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);
    }

    @Test
    void cancellingAfterTheOwnerConfirmedKeepsTheContactSpent() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        String id = book(buyer, listing(owner));
        setStatus(owner, id, "confirmed");

        setStatus(buyer, id, "cancelled");

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void anUnansweredVisitDoesNotLapseSoARescheduleCannotReviveItUnchecked() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        book(buyer, listing(owner));
        jdbc.update("update visits set created_at = ? where visitor_id = ?",
                java.sql.Timestamp.from(Instant.now().minus(10, ChronoUnit.DAYS)), buyer.getId());

        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS - 1);
    }

    @Test
    void anOwnerVisitingTheirOwnListingSpendsNothing() throws Exception {
        User owner = user("owner");

        visit(owner, listing(owner)).andExpect(status().isCreated());

        assertThat(remaining(owner)).isEqualTo(FREE_CONTACTS);
    }

    @Test
    void withNoContactsLeftOnlyAlreadyReachedOwnersCanBeVisited() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        Property contacted = listing(owner);
        for (int i = 0; i < FREE_CONTACTS; i++) {
            Property p = i == 0 ? contacted : listing(owner);
            ask(buyer, p).andExpect(status().isOk());
            jdbc.update("update contact_requests set status = 'approved' where requester_id = ?", buyer.getId());
        }

        visit(buyer, listing(owner)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("contact_quota_exhausted"));
        visit(buyer, contacted).andExpect(status().isCreated());
    }

    @Test
    void visitsAwaitingTheOwnerFillThePendingCap() throws Exception {
        User owner = user("owner");
        User buyer = user("buyer");
        for (int i = 0; i < 10; i++) {
            visit(buyer, listing(owner)).andExpect(status().isCreated());
        }

        ask(buyer, listing(owner)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("contact_pending_limit"));
        visit(buyer, listing(owner)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("contact_pending_limit"));
    }
}

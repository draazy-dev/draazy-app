package com.draazy.api.deals.deal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.leads.contact.ContactRequest;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Closing a deal (sold / rented) winds down what was open on the listing")
class ClosedListingSideEffectsTest extends AbstractApiTest {

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired ContactRequestRepository contactRequests;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Test User");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "Close me", "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private String visitStatus(User visitor, Property p) throws Exception {
        String body = mvc.perform(post(Routes.Visits.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(visitor))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + p.getId() + "\",\"slot\":\""
                                + Instant.now().plus(2, ChronoUnit.DAYS) + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");
    }

    @Test
    void finalizingTheDeal_cancelsBookedVisitsAndExpiresPendingContactRequests() throws Exception {
        User owner = user("9891300010", "owner");
        User buyer = user("9891300011", "buyer");
        User asker = user("9891300012", "buyer");
        Property p = listing(owner);
        String visitId = visitStatus(buyer, p);
        contactRequests.saveAndFlush(new ContactRequest(p.getId(), asker.getId(), "Is it available?"));

        mvc.perform(post("/me/deals/" + p.getId() + "/close")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"agreedPrice\":25000,\"counterpartyMobile\":\"9876543210\"}"))
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject("select status from visits where id = ?::uuid", String.class, visitId))
                .isEqualTo("cancelled");
        assertThat(jdbc.queryForObject(
                "select status from contact_requests where property_id = ?", String.class, p.getId()))
                .isEqualTo("expired");
        assertThat(jdbc.queryForObject(
                "select count(*) from notifications where user_id = ? and type = 'contact.returned'",
                Integer.class, asker.getId())).isEqualTo(1);
        List<Map<String, Object>> told = jdbc.queryForList(
                "select body from notifications where user_id = ? and type = 'visit.cancelled'", buyer.getId());
        assertThat(told).singleElement().satisfies(row ->
                assertThat((String) row.get("body")).contains("no longer available"));
    }
}

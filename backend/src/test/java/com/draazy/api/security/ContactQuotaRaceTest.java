package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.leads.contact.ContactRequest;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.support.AbstractCommittedApiTest;
import com.draazy.api.support.Races;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Parallel contact requests cannot exceed the quota or double-insert one listing")
class ContactQuotaRaceTest extends AbstractCommittedApiTest {

    private static final int FREE_LIMIT = 15;
    private static final int THREADS = 8;

    @Autowired
    PropertyRepository properties;

    @Autowired
    ContactRequestRepository contactRequests;

    @Override
    protected String mobilePrefix() {
        return "97913300";
    }

    private Property listing(User owner, String title) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private String ask(User buyer, Property p) {
        try {
            return String.valueOf(mvc.perform(post(Routes.Contacts.REQUEST)
                            .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"propertyId\":\"" + p.getId() + "\"}"))
                    .andReturn().getResponse().getStatus());
        } catch (Exception thrown) {
            Throwable cause = thrown.getCause() == null ? thrown : thrown.getCause();
            return "threw " + cause.getClass().getName() + ": " + cause.getMessage();
        }
    }

    private long contactRows(User buyer) {
        return jdbc.queryForObject("select count(*) from contact_requests where requester_id = ?",
                Long.class, buyer.getId());
    }

    @Test
    @DisplayName("one contact left, eight owners asked at once: never more rows than the allowance")
    void differentOwnersCannotOvershootTheAllowance() throws Exception {
        User buyer = user("01", "buyer");
        User filler = user("02", "owner");
        for (int i = 0; i < FREE_LIMIT - 1; i++) {
            contactRequests.saveAndFlush(new ContactRequest(listing(filler, "Filler " + i).getId(),
                    buyer.getId(), null));
        }
        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.remaining").value(1));

        List<Property> targets = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            targets.add(listing(user("1" + i, "owner"), "Target " + i));
        }
        List<String> outcomes = Collections.synchronizedList(new ArrayList<>());

        Races.run(THREADS, i -> outcomes.add(ask(buyer, targets.get(i))));

        assertThat(outcomes).as("the lock serialises them: exactly one fits the allowance")
                .containsOnlyOnce("200").filteredOn(o -> !o.equals("200")).containsOnly("422");
        assertThat(contactRows(buyer)).as("committed contact_requests for the buyer; outcomes=" + outcomes)
                .isEqualTo(FREE_LIMIT);
    }

    @Test
    @DisplayName("eight parallel requests for the same listing leave exactly one row and no 5xx")
    void sameListingIsInsertedOnce() {
        User buyer = user("03", "buyer");
        Property target = listing(user("04", "owner"), "Contested");
        List<String> outcomes = Collections.synchronizedList(new ArrayList<>());

        Races.run(THREADS, i -> outcomes.add(ask(buyer, target)));

        assertThat(outcomes).as("every duplicate tap is a plain re-read; outcomes=" + outcomes)
                .containsOnly("200");
        assertThat(contactRows(buyer)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from contact_requests where property_id = ?",
                Long.class, target.getId())).isEqualTo(1L);
    }
}

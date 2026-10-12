package com.draazy.api.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
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

@DisplayName("Parallel resumes cannot give an owner more live listings than the free tier")
class ListingGoLiveRaceTest extends AbstractCommittedApiTest {

    private static final int THREADS = 3;

    @Autowired
    PropertyRepository properties;

    @Override
    protected String mobilePrefix() {
        return "97914100";
    }

    private Property paused(User owner, int n) {
        Property p = new Property(owner, "Paused " + n, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus(PropertyStatus.PAUSED);
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private String resume(User owner, Property p) {
        try {
            var response = mvc.perform(post(Routes.MeListings.RESUME.replace("{id}", p.getId().toString()))
                            .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                    .andReturn().getResponse();
            return response.getStatus() == 200 ? "200" : response.getStatus() + " " + response.getContentAsString();
        } catch (Exception thrown) {
            return "threw " + thrown;
        }
    }

    @Test
    @DisplayName("three owner-paused listings resumed at once: exactly one goes live")
    void onlyOneResumeWins() {
        User owner = user("01", "owner");
        List<Property> listings = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            listings.add(paused(owner, i));
        }
        List<String> outcomes = Collections.synchronizedList(new ArrayList<>());

        Races.run(THREADS, i -> outcomes.add(resume(owner, listings.get(i))));

        assertThat(outcomes).as("outcomes=" + outcomes).containsOnlyOnce("200")
                .filteredOn(o -> !o.equals("200")).allMatch(o -> o.startsWith("422"));
        assertThat(jdbc.queryForObject(
                "select count(*) from properties where owner_id = ? and status = 'approved'",
                Long.class, owner.getId())).isEqualTo(1L);
    }
}

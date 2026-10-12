package com.draazy.api.catalog.property;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.user.UserStatuses;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class SuspendedOwnerListingsTest extends AbstractApiTest {

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Test User");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String search() throws Exception {
        return mvc.perform(get(Routes.Properties.BASE).param("q", "Zqsuspendhome"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private long liveInPune() {
        return properties.countLiveByCity(PropertyStatus.APPROVED).stream()
                .filter(row -> "pune".equals(row[0])).mapToLong(row -> ((Number) row[1]).longValue()).sum();
    }

    @Test
    void aSuspendedOwnersListingIsHiddenAndTakesNoNewLeadsUntilReactivated() throws Exception {
        User owner = user("9820300001", "owner");
        User buyer = user("9820300002", "buyer");
        Property p = new Property(owner, "Zqsuspendhome flat", "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus(PropertyStatus.APPROVED);
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p = properties.saveAndFlush(p);
        String byId = Routes.Properties.BY_ID.replace("{id}", p.getId().toString());
        assertThat(search()).contains(p.getId().toString());
        long counted = liveInPune();
        mvc.perform(put(Routes.Engagement.SAVED_BY_PROPERTY, p.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().is2xxSuccessful());

        owner.setStatus(UserStatuses.SUSPENDED);
        users.saveAndFlush(owner);

        assertThat(search()).doesNotContain(p.getId().toString());
        assertThat(liveInPune()).isEqualTo(counted - 1);
        mvc.perform(get(byId)).andExpect(status().isNotFound());
        mvc.perform(post(Routes.Visits.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + p.getId() + "\",\"slot\":\""
                                + Instant.now().plus(2, ChronoUnit.DAYS) + "\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post(Routes.Contacts.REQUEST)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + p.getId() + "\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(get(Routes.Engagement.SAVED).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.content[0].available").value(false));

        owner.setStatus(UserStatuses.ACTIVE);
        users.saveAndFlush(owner);

        assertThat(search()).contains(p.getId().toString());
        mvc.perform(get(byId)).andExpect(status().isOk());
    }
}

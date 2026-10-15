package com.draazy.api.moderation.property;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.moderation.verification.PropertyReview;
import com.draazy.api.moderation.verification.PropertyReviewRepository;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Moderation — closed listings and the Re-checks queue")
class RecheckClosedListingTest extends AbstractApiTest {

    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @Autowired
    PropertyReviewRepository reviews;

    private User user(String mobile, String role) {
        User user = new User(mobile, role);
        user.setName(mobile);
        user.setMobileVerified(true);
        return users.saveAndFlush(user);
    }

    private Property soldWithRecheck(User owner) {
        Property property = new Property(owner, "Sold flat", "buy", "apartment", 9000000L, "Baner", "Pune");
        property.setStatus(PropertyStatus.SOLD);
        properties.saveAndFlush(property);
        jdbc.update("update properties set recheck_requested_at = now(), recheck_reason = 'price',"
                + " locality_slug = 'baner' where id = ?", property.getId());
        return property;
    }

    @Test
    @DisplayName("a sold listing leaves the Re-checks queue and its count")
    void soldListingIsNotInTheQueue() throws Exception {
        User admin = user("9833350101", "admin");
        Property sold = soldWithRecheck(user("9833350102", "owner"));

        mvc.perform(get("/admin/properties").param("recheck", "true")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id == '" + sold.getId() + "')]").isEmpty());
        mvc.perform(get("/admin/properties/summary").header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recheck").value(0));
    }

    @Test
    @DisplayName("a refused approval of a sold listing leaves no checklist-reset audit row")
    void refusedApprovalWritesNoAudit() throws Exception {
        User admin = user("9833350103", "admin");
        Property sold = soldWithRecheck(user("9833350104", "owner"));
        reviews.saveAndFlush(new PropertyReview(sold.getId()));

        mvc.perform(patch("/properties/" + sold.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"approved\"}"))
                .andExpect(status().is4xxClientError());

        Integer rows = jdbc.queryForObject("select count(*) from audit_log where action ="
                + " 'property.verification.checklist.reset' and entity_id = ?", Integer.class,
                sold.getId().toString());
        assertThat(rows).isZero();
    }
}

package com.draazy.api.finance.tenancy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Tenancy — a revoked stay is forward-only (D204)")
class TenancyRevocationIsForwardOnlyTest extends AbstractApiTest {
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;

    private User user(String mobile, String name) {
        User u = new User(mobile, "buyer");
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "2BHK in Wakad", "rent", "apartment", 22000L,
                "Wakad", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("900"));
        p.setStatus(PropertyStatus.APPROVED);
        return properties.saveAndFlush(p);
    }

    private String declare(User claimant, Property p) throws Exception {
        String json = mvc.perform(post("/properties/" + p.getId() + "/tenancy-declarations")
                        .header(HttpHeaders.AUTHORIZATION, bearer(claimant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"livedFrom\":\"2024-01-01\",\"livedTo\":\"2025-06-30\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private void decide(User owner, String declarationId, String verb, String expectedStatus)
            throws Exception {
        mvc.perform(post("/tenancy-declarations/" + declarationId + "/" + verb)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(expectedStatus));
    }

    private String publishedReviews(Property p) throws Exception {
        return mvc.perform(get("/properties/" + p.getId() + "/reviews"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private int reviewAttempt(User author, Property p, String body) throws Exception {
        return mvc.perform(post("/properties/" + p.getId() + "/reviews")
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":4,\"body\":\"%s\"}".formatted(body)))
                .andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("the review already written survives untouched, and the next one is refused")
    void revocationRetractsNothingAndAuthorisesNothingFurther() throws Exception {
        User owner = user("9844100001", "Nikhil Rane");
        User wrote = user("9844100002", "Sneha Kale");
        User writesLater = user("9844100003", "Rohit Jadhav");
        Property p = listing(owner);

        String confirmed = declare(wrote, p);
        decide(owner, confirmed, "confirm", TenancyDeclarationStatuses.CONFIRMED);
        mvc.perform(post("/properties/" + p.getId() + "/reviews")
                        .header(HttpHeaders.AUTHORIZATION, bearer(wrote))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":2,\"body\":\"Damp in both bedrooms all monsoon.\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.context").value("tenant"));

        String before = publishedReviews(p);
        assertThat(before).contains("Damp in both bedrooms all monsoon.").contains("\"tenant\"");

        decide(owner, confirmed, "revoke", TenancyDeclarationStatuses.REVOKED);

        assertThat(publishedReviews(p)).isEqualTo(before);

        String revoked = declare(writesLater, p);
        decide(owner, revoked, "confirm", TenancyDeclarationStatuses.CONFIRMED);
        decide(owner, revoked, "revoke", TenancyDeclarationStatuses.REVOKED);

        assertThat(reviewAttempt(writesLater, p, "Lived here briefly.")).isEqualTo(422);

        assertThat(publishedReviews(p)).isEqualTo(before);
    }
}

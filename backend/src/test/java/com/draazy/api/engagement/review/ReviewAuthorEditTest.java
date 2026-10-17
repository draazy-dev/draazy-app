package com.draazy.api.engagement.review;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.deals.visit.Visit;
import com.draazy.api.deals.visit.VisitRepository;
import com.draazy.api.deals.visit.VisitStatuses;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import com.jayway.jsonpath.JsonPath;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Engagement — an author edits and deletes their own review")
class ReviewAuthorEditTest extends AbstractApiTest {

    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @Autowired
    VisitRepository visits;

    private User user(String mobile, String name) {
        User u = new User(mobile, "buyer");
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String societyPath() {
        return "/reviews/society/" + jdbc.queryForObject(
                "select slug from societies order by slug limit 1", String.class);
    }

    private String create(User author, String path, String json) throws Exception {
        String body = mvc.perform(post(path)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.mine").value(true))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    @Test
    @DisplayName("the author's own row is marked mine, only for them, and an edit replaces what they wrote")
    void authorEditsOwnReview() throws Exception {
        User author = user("9820000101", "Rahul Joshi");
        User other = user("9820000102", "Meera Kulkarni");
        String path = societyPath();
        String id = create(author, path, "{\"rating\":5,\"body\":\"Great\",\"categories\":{\"Safety\":5}}");

        mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearer(author)))
                .andExpect(jsonPath("$.content[0].mine").value(true));
        mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearer(other)))
                .andExpect(jsonPath("$.content[0].mine").doesNotExist());
        mvc.perform(get(path))
                .andExpect(jsonPath("$.content[0].mine").doesNotExist());

        mvc.perform(put("/reviews/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":2,\"body\":\"Lifts break often\",\"categories\":{\"Maintenance\":1}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.rating").value(2))
                .andExpect(jsonPath("$.body").value("Lifts break often"))
                .andExpect(jsonPath("$.categories.Maintenance").value(1))
                .andExpect(jsonPath("$.categories.Safety").doesNotExist())
                .andExpect(jsonPath("$.mine").value(true));

        mvc.perform(get(path))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.summary.avgRating").value(2.0));

        mvc.perform(put("/reviews/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":3,\"categories\":{\"accuracy\":4}}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("an edit keeps the server-derived badge of a property review")
    void editKeepsTheBadge() throws Exception {
        User owner = user("9810000103", "Asha Patil");
        User visitor = user("9820000103", "Rahul Joshi");
        Property p = new Property(owner, "2BHK in Kothrud", "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setStatus(PropertyStatus.APPROVED);
        p = properties.saveAndFlush(p);
        Visit v = new Visit(p.getId(), visitor.getId(), Instant.now().minus(2, ChronoUnit.DAYS), "in-person", null);
        v.setStatus(VisitStatuses.COMPLETED);
        visits.saveAndFlush(v);
        String id = create(visitor, "/properties/" + p.getId() + "/reviews", "{\"rating\":5}");

        mvc.perform(put("/reviews/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(visitor))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rating\":3,\"recommend\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.context").value("visit"))
                .andExpect(jsonPath("$.recommend").value(false));

        mvc.perform(get("/properties/" + p.getId() + "/reviews").header(HttpHeaders.AUTHORIZATION, bearer(visitor)))
                .andExpect(jsonPath("$.content[0].rating").value(3))
                .andExpect(jsonPath("$.content[0].mine").value(true));
    }

    @Test
    @DisplayName("deleting frees the author to review again; nobody else can edit or delete it")
    void deleteIsAuthorOnly() throws Exception {
        User author = user("9820000104", "Rahul Joshi");
        User other = user("9820000105", "Meera Kulkarni");
        String path = societyPath();
        String id = create(author, path, "{\"rating\":4}");

        mvc.perform(put("/reviews/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(other))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rating\":1}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/reviews/" + id).header(HttpHeaders.AUTHORIZATION, bearer(other)))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/reviews/" + id))
                .andExpect(status().isUnauthorized());

        mvc.perform(delete("/reviews/" + id).header(HttpHeaders.AUTHORIZATION, bearer(author)))
                .andExpect(status().isNoContent());
        mvc.perform(get(path))
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.summary.reviewCount").value(0));

        create(author, path, "{\"rating\":3}");
    }

    @Test
    @DisplayName("a review staff rejected can be neither edited nor deleted, so a takedown sticks")
    void rejectedReviewIsLocked() throws Exception {
        User author = user("9820000106", "Rahul Joshi");
        String id = jdbc.queryForObject("insert into reviews (target_type, target_id, author_id, rating, status) "
                + "values ('society', gen_random_uuid()::text, ?, 1, 'rejected') returning id::text",
                String.class, author.getId());

        mvc.perform(put("/reviews/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"rating\":5}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/reviews/" + id).header(HttpHeaders.AUTHORIZATION, bearer(author)))
                .andExpect(status().isNotFound());
    }
}

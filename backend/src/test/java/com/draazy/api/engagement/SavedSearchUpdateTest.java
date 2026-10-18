package com.draazy.api.engagement;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Saved searches — alert preferences are editable")
class SavedSearchUpdateTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    private User seeker(String mobile) {
        User u = new User(mobile, "buyer");
        u.setName("Alert Watcher");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String createSearch(User u) throws Exception {
        String body = mvc.perform(post("/me/saved-searches")
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"2BHK Baner\",\"query\":\"2bhk baner\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.alertFrequency").value("daily"))
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll("(?s).*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    @Test
    @DisplayName("frequency changes keep saved-search delivery in-app")
    void preferencesAreUpdatable() throws Exception {
        User u = seeker("9820000001");
        String id = createSearch(u);

        mvc.perform(patch("/me/saved-searches/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"alertFrequency\":\"weekly\",\"channel\":\"email\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alertFrequency").value("weekly"))
                .andExpect(jsonPath("$.channel").value("push"));
    }

    /** {@code off} is a vocabulary value, not a null, so this record needs no absent-vs-null distinction. */
    @Test
    @DisplayName("turning alerts off is a value, not an absence")
    void alertsCanBeTurnedOff() throws Exception {
        User u = seeker("9820000002");
        String id = createSearch(u);

        mvc.perform(patch("/me/saved-searches/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"alertFrequency\":\"off\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.alertFrequency").value("off"))
                .andExpect(jsonPath("$.channel").value("push"));
    }

    @Test
    @DisplayName("an unknown frequency is a 422, not a 500 from the CHECK constraint")
    void unknownFrequencyIsRejectedAtTheEdge() throws Exception {
        User u = seeker("9820000003");
        String id = createSearch(u);

        mvc.perform(patch("/me/saved-searches/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"alertFrequency\":\"hourly\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("an edited listings alert keeps its id and swaps its filters in place")
    void filtersAreReplacedInPlace() throws Exception {
        User u = seeker("9820000006");
        String id = createSearch(u);

        mvc.perform(patch("/me/saved-searches/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"3 BHK · Buy · Kothrud\",\"query\":\"3 BHK · Buy · Kothrud\","
                                + "\"filters\":{\"deal\":\"buy\",\"bhk\":[\"3\"],\"localities\":[\"kothrud\"]},"
                                + "\"alertFrequency\":\"weekly\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.name").value("3 BHK · Buy · Kothrud"))
                .andExpect(jsonPath("$.filters.bhk[0]").value("3"))
                .andExpect(jsonPath("$.filters.localities[0]").value("kothrud"))
                .andExpect(jsonPath("$.alertFrequency").value("weekly"))
                .andExpect(jsonPath("$.newCount").value(0));

        mvc.perform(get("/me/saved-searches").header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    @DisplayName("editing an alert into a copy of another one is a 409")
    void editIntoDuplicateConflicts() throws Exception {
        User u = seeker("9820000007");
        String id = createSearch(u);
        mvc.perform(post("/me/saved-searches")
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"1bhk wakad\",\"filters\":{\"bhk\":[\"1\"]}}"))
                .andExpect(status().isCreated());

        mvc.perform(patch("/me/saved-searches/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"1BHK Wakad\",\"filters\":{\"bhk\":[\"1\"]}}"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("new filters without a query are a 422")
    void filtersNeedAQuery() throws Exception {
        User u = seeker("9820000008");
        String id = createSearch(u);

        mvc.perform(patch("/me/saved-searches/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"filters\":{\"bhk\":[\"2\"]}}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("a flatmates alert's filters are not editable here")
    void flatmateFiltersAreRejected() throws Exception {
        User u = seeker("9820000009");
        String body = mvc.perform(post("/me/saved-searches")
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"kind\":\"flatmates\",\"criteria\":{\"tab\":\"rooms\"}}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = body.replaceAll("(?s).*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");

        mvc.perform(patch("/me/saved-searches/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"query\":\"rooms\",\"filters\":{\"tab\":\"rooms\"}}"))
                .andExpect(status().isBadRequest());
    }

    /** 404, not 403: "exists but not yours" would confirm the id is real. */
    @Test
    @DisplayName("another user's saved search is 404, never 403")
    void crossUserUpdateIsNotFound() throws Exception {
        User owner = seeker("9820000004");
        User stranger = seeker("9820000005");
        String id = createSearch(owner);

        mvc.perform(patch("/me/saved-searches/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"alertFrequency\":\"off\"}"))
                .andExpect(status().isNotFound());

        // And the owner's row is untouched by the attempt.
        mvc.perform(get("/me/saved-searches").header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].alertFrequency").value("daily"));
    }
}

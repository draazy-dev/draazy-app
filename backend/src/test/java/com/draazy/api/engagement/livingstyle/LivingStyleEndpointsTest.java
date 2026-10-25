package com.draazy.api.engagement.livingstyle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("GET/PUT /me/living-style")
class LivingStyleEndpointsTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    private User person(String mobile) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private MockHttpServletRequestBuilder save(User who, String body) {
        return put(Routes.Engagement.LIVING_STYLE)
                .header(HttpHeaders.AUTHORIZATION, bearer(who))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private int rows(User who) {
        return jdbc.queryForObject("select count(*) from user_living_style where user_id = ?",
                Integer.class, who.getId());
    }

    @Test
    @DisplayName("a guest gets 401 on both verbs")
    void guestIsRefused() throws Exception {
        mvc.perform(get(Routes.Engagement.LIVING_STYLE)).andExpect(status().isUnauthorized());
        mvc.perform(put(Routes.Engagement.LIVING_STYLE).contentType(MediaType.APPLICATION_JSON)
                .content("{\"answers\":{}}")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a user with no answers reads an empty object and a null timestamp")
    void emptyByDefault() throws Exception {
        mvc.perform(get(Routes.Engagement.LIVING_STYLE).header(HttpHeaders.AUTHORIZATION, bearer(person("9830000001"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers").isEmpty())
                .andExpect(jsonPath("$.updatedAt").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    @DisplayName("any subset is saved, replaced whole on the next PUT, and read back in question order")
    void savesAndReplaces() throws Exception {
        User me = person("9830000002");
        mvc.perform(save(me, "{\"answers\":{\"quiet\":1,\"tidy\":0,\"pets\":2}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers.tidy").value(0))
                .andExpect(jsonPath("$.answers.pets").value(2))
                .andExpect(jsonPath("$.answers.quiet").value(1))
                .andExpect(jsonPath("$.updatedAt").isNotEmpty());

        mvc.perform(save(me, "{\"answers\":{\"food\":2}}")).andExpect(status().isOk());

        mvc.perform(get(Routes.Engagement.LIVING_STYLE).header(HttpHeaders.AUTHORIZATION, bearer(me)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers.food").value(2))
                .andExpect(jsonPath("$.answers.tidy").doesNotExist())
                .andExpect(jsonPath("$.answers.length()").value(1));
        assertThat(rows(me)).isEqualTo(1);
    }

    @Test
    @DisplayName("an empty answers map deletes the row")
    void emptyDeletes() throws Exception {
        User me = person("9830000003");
        mvc.perform(save(me, "{\"answers\":{\"tidy\":1}}")).andExpect(status().isOk());
        assertThat(rows(me)).isEqualTo(1);

        mvc.perform(save(me, "{\"answers\":{}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers").isEmpty())
                .andExpect(jsonPath("$.updatedAt").value(org.hamcrest.Matchers.nullValue()));
        assertThat(rows(me)).isZero();
        mvc.perform(save(me, "{\"answers\":{}}")).andExpect(status().isOk());
    }

    @Test
    @DisplayName("an unknown key, an out-of-range, fractional or non-numeric value, or a missing map is a 400")
    void invalidBodiesAreRefused() throws Exception {
        User me = person("9830000004");
        for (String body : new String[] {
                "{\"answers\":{\"cooking\":1}}",
                "{\"answers\":{\"tidy\":3}}",
                "{\"answers\":{\"tidy\":-1}}",
                "{\"answers\":{\"tidy\":1.5}}",
                "{\"answers\":{\"tidy\":\"1\"}}",
                "{\"answers\":{\"tidy\":null}}",
                "{\"answers\":{\"tidy\":1,\"cooking\":1}}",
                "{}"}) {
            mvc.perform(save(me, body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.status").value(400))
                    .andExpect(jsonPath("$.error").isNotEmpty())
                    .andExpect(jsonPath("$.message").isNotEmpty());
        }
        assertThat(rows(me)).isZero();
    }
}

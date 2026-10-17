package com.draazy.api.identity.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("PATCH /auth/me profile updates")
class UserProfileUpdateTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    @PersistenceContext
    EntityManager em;

    private User user(String name, boolean verified) {
        User user = new User(freshMobile(), Roles.Wire.OWNER);
        user.setName(name);
        user.setMobileVerified(true);
        user.setVerified(verified);
        return users.saveAndFlush(user);
    }

    @Test
    @DisplayName("a verified user cannot change name from self-service")
    void verifiedNameChangeIsLocked() throws Exception {
        User user = user("Locked Name", true);

        mvc.perform(patch(Routes.Auth.ME)
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"New Name\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("NAME_LOCKED_WHILE_VERIFIED"));

        em.clear();
        assertThat(users.findById(user.getId()).orElseThrow().getName()).isEqualTo("Locked Name");
    }

    @Test
    @DisplayName("verified users can still update non-name profile fields")
    void verifiedNonNameFieldsStillUpdate() throws Exception {
        User user = user("Locked Name", true);

        mvc.perform(patch(Routes.Auth.ME)
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Locked Name","email":"locked@example.test",
                                 "city":"Pune","hideNumber":true}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Locked Name"))
                .andExpect(jsonPath("$.email").value("locked@example.test"))
                .andExpect(jsonPath("$.city").value("Pune"))
                .andExpect(jsonPath("$.hideNumber").value(true));
    }

    @Test
    @DisplayName("an unverified user can change name")
    void unverifiedNameChangeWorks() throws Exception {
        User user = user("Old Name", false);

        mvc.perform(patch(Routes.Auth.ME)
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"New Name\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("New Name"));
    }

    private ResultActions patchGender(User user, String gender)
            throws Exception {
        return mvc.perform(patch(Routes.Auth.ME)
                .header(HttpHeaders.AUTHORIZATION, bearer(user))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"gender\":\"" + gender + "\"}"));
    }

    @Test
    @DisplayName("gender is set once by the user, then locked; the same value is a no-op")
    void genderIsSetOnceThenLocked() throws Exception {
        User user = user("Asha", false);

        patchGender(user, "female").andExpect(status().isOk())
                .andExpect(jsonPath("$.gender").value("female"));
        mvc.perform(get(Routes.Auth.ME).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gender").value("female"));
        patchGender(user, "male").andExpect(status().isConflict())
                .andExpect(jsonPath("$.message", containsString("already set")));
        patchGender(user, "female").andExpect(status().isOk());

        em.flush();
        assertThat(jdbc.queryForObject("select gender from users where id = ?", String.class, user.getId()))
                .isEqualTo("female");
    }

    @Test
    @DisplayName("gender accepts only male or female, and a patch without it leaves it alone")
    void genderIsValidatedAndOptional() throws Exception {
        User user = user("Ravi", false);

        patchGender(user, "other").andExpect(status().isUnprocessableEntity());
        patchGender(user, "male").andExpect(status().isOk());
        mvc.perform(patch(Routes.Auth.ME)
                        .header(HttpHeaders.AUTHORIZATION, bearer(user))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"city\":\"Pune\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.gender").value("male"));
    }

    private static String freshMobile() {
        long n = Math.abs(UUID.randomUUID().getMostSignificantBits() % 1_000_000_000L);
        return "9" + String.format("%09d", n);
    }
}

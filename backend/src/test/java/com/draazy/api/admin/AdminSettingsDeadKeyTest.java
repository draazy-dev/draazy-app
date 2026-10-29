package com.draazy.api.admin;

import com.draazy.api.support.AbstractApiTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("D67/D13 — the dead customRoles key is refused, not stored")
class AdminSettingsDeadKeyTest extends AbstractApiTest {
    private static final String CUSTOM_ROLES =
            "[{\"id\":\"CR_evil\",\"name\":\"Ops\",\"modules\":[\"settings\",\"team\"]}]";

    @Autowired
    UserRepository users;

    private String admin(String mobile) {
        User u = new User(mobile, Roles.Wire.ADMIN);
        u.setName("Dead key " + mobile.substring(6));
        u.setMobileVerified(true);
        return bearer(users.saveAndFlush(u));
    }

    private int save(String token, String body) throws Exception {
        return mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn().getResponse().getStatus();
    }

    private Integer storedCustomRoleRows() {
        return jdbc.queryForObject(
                "select count(*) from settings where key = 'customRoles'", Integer.class);
    }

    private Integer auditRows() {
        return jdbc.queryForObject(
                "select count(*) from audit_log where action = 'settings.update'", Integer.class);
    }

    @Test
    @DisplayName("no customRoles document is stored")
    void theKeyIsNotStoredAtAll() {
        assertThat(storedCustomRoleRows()).isZero();
    }

    @Test
    @DisplayName("writing it is refused with 422")
    void writingItIsRefused() throws Exception {
        assertThat(save(admin("9877720001"), "{\"customRoles\":" + CUSTOM_ROLES + "}"))
                .isEqualTo(422);
    }

    @Test
    @DisplayName("a refused write stores nothing at all, not even its valid keys")
    void aRefusedWriteIsAtomic() throws Exception {
        String token = admin("9877720002");

        assertThat(save(token, "{\"flags\":{\"deadKeyProbe\":true},\"customRoles\":" + CUSTOM_ROLES + "}"))
                .isEqualTo(422);

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.deadKeyProbe").doesNotExist())
                .andExpect(jsonPath("$.customRoles").doesNotExist());
        assertThat(storedCustomRoleRows()).isZero();
    }

    @Test
    @DisplayName("an empty list is refused as firmly as a populated one")
    void anEmptyListIsRefusedToo() throws Exception {
        assertThat(save(admin("9877720003"), "{\"customRoles\":[]}")).isEqualTo(422);
    }

    @Test
    @DisplayName("a refused write records no audit row")
    void aRefusedWriteRecordsNoAuditRow() throws Exception {
        int before = auditRows();

        assertThat(save(admin("9877720004"), "{\"customRoles\":" + CUSTOM_ROLES + "}"))
                .isEqualTo(422);

        assertThat(auditRows()).isEqualTo(before);
    }

    @Test
    @DisplayName("an ordinary write is untouched by the refusal")
    void anOrdinaryWriteStillSucceeds() throws Exception {
        String token = admin("9877720005");

        assertThat(save(token, "{\"flags\":{\"deadKeyControl\":true}}")).isEqualTo(200);

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.deadKeyControl").value(true))
                .andExpect(jsonPath("$.fees").exists());
    }

    @Test
    @DisplayName("geo.cities.*.live is refused, and points at the route that replaced it")
    void theRetiredCityLiveKeyIsRefused() throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, admin("9877720007"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"geo\":{\"cities\":{\"Mumbai\":{\"live\":true}}}}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("/admin/cities/{slug}")));
    }

    @Test
    @DisplayName("the rest of the geo block still saves normally")
    void geoBoundsAndBlacklistStillSave() throws Exception {
        String token = admin("9877720008");

        assertThat(save(token, """
                {"geo":{"enforceCityLimit":true,"cities":{"Mumbai":{"center":{"lat":19.076,\
                "lng":72.8777}}},"blacklist":[{"id":"bl1","term":"Camp"}]}}"""))
                .isEqualTo(200);

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.cities.Mumbai.center.lat").value(19.076))
                .andExpect(jsonPath("$.geo.blacklist[0].term").value("Camp"));
    }

    @Test
    @DisplayName("a flag sent as a string is refused, not stored as a truthy value")
    void aStringFlagIsRefused() throws Exception {
        String token = admin("9877720009");

        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"flags\":{\"signupsEnabled\":\"false\"}}"))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("flags.signupsEnabled")));

        assertThat(jdbc.queryForObject(
                "select jsonb_typeof(value->'signupsEnabled') from settings where key = 'flags'",
                String.class))
                .as("a refused flag must not be stored at all, least of all as a truthy string")
                .isNotEqualTo("string");
    }

    @Test
    @DisplayName("a genuine boolean flag still saves, false included")
    void aBooleanFlagStillSaves() throws Exception {
        String token = admin("9877720010");

        assertThat(save(token, "{\"flags\":{\"signupsEnabled\":false}}")).isEqualTo(200);

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.signupsEnabled").value(false));
    }
}

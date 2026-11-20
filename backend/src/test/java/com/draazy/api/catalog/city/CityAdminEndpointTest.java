package com.draazy.api.catalog.city;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import com.draazy.api.support.AbstractApiTest;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CityAdminEndpointTest extends AbstractApiTest {
    @Autowired
    UserRepository users;

    private String adminId;

    @AfterEach
    void restoreBaseline() {
        if (adminId != null) {
            jdbc.update("delete from audit_log where actor = ?", adminId);
        }
        jdbc.update("update cities set live = (slug = 'pune')");
    }

    private String token(String mobile, String role) {
        User user = new User(mobile, role);
        user.setName(role + " city editor");
        user.setMobileVerified(true);
        if (Roles.Wire.STAFF.equals(role)) user.setTeam(Teams.RENTAL);
        User saved = users.saveAndFlush(user);
        if (Roles.Wire.ADMIN.equals(role)) {
            adminId = saved.getId().toString();
        }
        return bearer(saved);
    }

    @Test
    void adminCanToggleACityAndThePublicCatalogueReflectsIt() throws Exception {
        mvc.perform(patch(Routes.Admin.CITY_BY_SLUG.replace("{slug}", "mumbai"))
                        .header(HttpHeaders.AUTHORIZATION, token("9877731001", Roles.Wire.ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"live":true}"""))
                .andExpect(status().isNoContent());

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cities[?(@.slug=='mumbai')].live", contains(true)));
    }

    @Test
    void togglingACityIsAudited() throws Exception {
        mvc.perform(patch(Routes.Admin.CITY_BY_SLUG.replace("{slug}", "hyderabad"))
                        .header(HttpHeaders.AUTHORIZATION, token("9877731005", Roles.Wire.ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"live":true}"""))
                .andExpect(status().isNoContent());

        Map<String, Object> row = jdbc.queryForMap(
                "select action, entity, entity_id, metadata::text as metadata "
                        + "from audit_log where actor = ?", adminId);

        assertThat(row.get("action")).isEqualTo("city.update");
        assertThat(row.get("entity")).isEqualTo("city");
        assertThat(row.get("entity_id")).isEqualTo("hyderabad");
        assertThat(String.valueOf(row.get("metadata")))
                .contains("\"beforeLive\": false")
                .contains("\"afterLive\": true");
    }

    @ParameterizedTest(name = "{0} is refused")
    @CsvSource({"routeIsAdminOnly_owner, 9877731002, owner", "aManagerCannotEditCities, 9877731006, manager"})
    void aNonAdminCannotEditCities(String name, String mobile, String role) throws Exception {
        mvc.perform(patch(Routes.Admin.CITY_BY_SLUG.replace("{slug}", "mumbai"))
                        .header(HttpHeaders.AUTHORIZATION, token(mobile, role))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"live":true}"""))
                .andExpect(status().isForbidden());
    }

    @Test
    void missingLiveIsAValidationError() throws Exception {
        mvc.perform(patch(Routes.Admin.CITY_BY_SLUG.replace("{slug}", "mumbai"))
                        .header(HttpHeaders.AUTHORIZATION, token("9877731003", Roles.Wire.ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isUnprocessableContent());
    }

    @Test
    void unknownCityIsNotFound() throws Exception {
        mvc.perform(patch(Routes.Admin.CITY_BY_SLUG.replace("{slug}", "nagpur"))
                        .header(HttpHeaders.AUTHORIZATION, token("9877731004", Roles.Wire.ADMIN))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"live":true}"""))
                .andExpect(status().isNotFound());
    }

    private void waitlisted(String mobile, String city, String createdAt) {
        jdbc.update("insert into city_waitlist (mobile, city, created_at) values (?, ?, ?::timestamptz)",
                mobile, city, createdAt);
    }

    @AfterEach
    void clearWaitlist() {
        jdbc.update("delete from city_waitlist where mobile like '98777320%'");
    }

    @Test
    void theWaitlistIsAggregatedByCityMostWantedFirst() throws Exception {
        waitlisted("9877732001", "Nashik", "2024-01-01T10:00:00Z");
        waitlisted("9877732002", "Nashik", "2024-01-02T10:00:00Z");
        waitlisted("9877732003", "Nagpur", "2024-03-01T10:00:00Z");

        mvc.perform(get(Routes.Admin.CITY_WAITLIST)
                        .header(HttpHeaders.AUTHORIZATION, token("9877731010", Roles.Wire.ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.city=='Nashik')].requests", contains(2)))
                .andExpect(jsonPath("$[?(@.city=='Nagpur')].requests", contains(1)))
                .andExpect(jsonPath("$[?(@.city=='Nashik')].lastRequestedAt",
                        contains("2024-01-02T10:00:00Z")))
                .andExpect(jsonPath("$[0].city").value("Nashik"));
    }

    @Test
    void citiesDifferingOnlyByCaseAreOneRow() throws Exception {
        waitlisted("9877732004", "Indore", "2024-01-01T10:00:00Z");
        waitlisted("9877732005", "indore", "2024-01-02T10:00:00Z");

        mvc.perform(get(Routes.Admin.CITY_WAITLIST)
                        .header(HttpHeaders.AUTHORIZATION, token("9877731011", Roles.Wire.ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.city =~ /(?i)indore/)].requests", contains(2)));
    }

    @Test
    void theReportCarriesNoContactDetail() throws Exception {
        waitlisted("9877732006", "Surat", "2024-01-01T10:00:00Z");

        String body = mvc.perform(get(Routes.Admin.CITY_WAITLIST)
                        .header(HttpHeaders.AUTHORIZATION, token("9877731012", Roles.Wire.ADMIN)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).contains("Surat").doesNotContain("9877732006").doesNotContain("mobile");
    }

    @Test
    void theWaitlistIsStaffReadableAndNotPublic() throws Exception {
        mvc.perform(get(Routes.Admin.CITY_WAITLIST)).andExpect(status().isUnauthorized());

        mvc.perform(get(Routes.Admin.CITY_WAITLIST)
                        .header(HttpHeaders.AUTHORIZATION, token("9877731013", Roles.Wire.BUYER)))
                .andExpect(status().isForbidden());

        mvc.perform(get(Routes.Admin.CITY_WAITLIST)
                        .header(HttpHeaders.AUTHORIZATION, token("9877731014", Roles.Wire.STAFF)))
                .andExpect(status().isOk());
    }
}

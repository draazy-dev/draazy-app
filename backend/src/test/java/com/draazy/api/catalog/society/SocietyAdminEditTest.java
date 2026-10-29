package com.draazy.api.catalog.society;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Societies — correcting a building's facts")
class SocietyAdminEditTest extends AbstractApiTest {
    @Autowired UserRepository users;

    // REQUIRES_NEW audit rows survive rollback; sweep in static hooks (an @AfterEach sweep rolls back).
    // Killed runs leave rows in the shared DB.
    @BeforeAll
    static void removeAuditRowsLeftByAnEarlierRun(@Autowired JdbcTemplate jdbc) {
        sweepOwnAuditRows(jdbc);
    }

    @AfterAll
    static void removeAuditRowsThatEscapedRollback(@Autowired JdbcTemplate jdbc) {
        sweepOwnAuditRows(jdbc);
    }

    private static void sweepOwnAuditRows(JdbcTemplate jdbc) {
        jdbc.update("delete from audit_log where entity = 'society' and entity_id like '%-d244'");
    }

    private User member(String mobile, String name) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String staff(String mobile) {
        User u = new User(mobile, Roles.Wire.STAFF);
        u.setName("Ops " + mobile.substring(6));
        u.setMobileVerified(true);
        return bearer(users.saveAndFlush(u));
    }

    private String society(User author, String name) throws Exception {
        ResultActions minted = mvc.perform(post("/societies")
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"placeId\":\"test-" + name.trim().toLowerCase().replaceAll("\\s+", "-") + "\",\"name\":\"" + name + "\"}"))
                .andExpect(status().isCreated());
        String json = minted.andReturn().getResponse().getContentAsString();
        int at = json.indexOf("\"slug\":\"") + 8;
        return json.substring(at, json.indexOf('"', at));
    }

    private ResultActions edit(String token, String slug, String body) throws Exception {
        return mvc.perform(patch("/admin/societies/" + slug)
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions read(String token, String slug) throws Exception {
        return mvc.perform(get("/admin/societies/" + slug)
                .header(HttpHeaders.AUTHORIZATION, token));
    }

    private Map<String, Object> row(String slug) {
        return jdbc.queryForMap("select registration, conveyance, maintenance_per_sqft,"
                + " admin_note from societies where slug = ?", slug);
    }

    @Test
    @DisplayName("each of the four fields persists, and a second operator reads them back")
    void anEditIsSharedRatherThanHeldInOneBrowser() throws Exception {
        User author = member("9869000001", "Aarav Edit");
        String first = staff("9869000002");
        String second = staff("9869000003");
        String slug = society(author, "Sereno Heights D244");

        edit(first, slug, "{\"registration\":true,\"conveyance\":true,"
                + "\"maintenancePerSqft\":3.5,"
                + "\"adminNote\":\"Conveyance deed seen; registration number unconfirmed.\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(slug))
                .andExpect(jsonPath("$.registration").value(true))
                .andExpect(jsonPath("$.conveyance").value(true))
                .andExpect(jsonPath("$.maintenancePerSqft").value(3.5))
                .andExpect(jsonPath("$.adminNote")
                        .value("Conveyance deed seen; registration number unconfirmed."));

        read(second, slug)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.registration").value(true))
                .andExpect(jsonPath("$.maintenancePerSqft").value(3.5))
                .andExpect(jsonPath("$.adminNote")
                        .value("Conveyance deed seen; registration number unconfirmed."));

        Map<String, Object> stored = row(slug);
        assertThat(stored.get("registration")).isEqualTo(true);
        assertThat(stored.get("conveyance")).isEqualTo(true);
        assertThat(stored.get("admin_note").toString()).startsWith("Conveyance deed seen");
    }

    @Test
    @DisplayName("the admin directory is a staff read of slim rows that carries the maintenance figure")
    void adminDirectoryIsSlimAndStaffOnly() throws Exception {
        User author = member("9869000040", "Dev Directory");
        String ops = staff("9869000041");
        String slug = society(author, "Zephyr Gardens D244");
        edit(ops, slug, "{\"maintenancePerSqft\":4.25}").andExpect(status().isOk());

        mvc.perform(get("/admin/societies").param("q", "zephyr gardens")
                        .header(HttpHeaders.AUTHORIZATION, ops))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].slug").value(slug))
                .andExpect(jsonPath("$.content[0].maintenancePerSqft").value(4.25))
                .andExpect(jsonPath("$.content[0].avgRating").doesNotExist())
                .andExpect(jsonPath("$.content[0].reviewCount").doesNotExist());

        mvc.perform(get("/admin/societies").header(HttpHeaders.AUTHORIZATION, bearer(author)))
                .andExpect(status().isForbidden());
        mvc.perform(get("/societies").param("q", "zephyr gardens"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].slug").value(slug))
                .andExpect(jsonPath("$.content[0].maintenancePerSqft").doesNotExist());
    }

    @Test
    @DisplayName("the internal note never appears on the public read of the same society")
    void theNoteDoesNotLeaveTheBackOffice() throws Exception {
        User author = member("9869000004", "Isha Note");
        String slug = society(author, "Palm Grove D244");

        edit(staff("9869000005"), slug, "{\"adminNote\":\"Committee unreachable since June.\"}")
                .andExpect(status().isOk());

        mvc.perform(get("/societies/" + slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value(slug))
                .andExpect(jsonPath("$.adminNote").doesNotExist());
    }

    @Test
    @DisplayName("an omitted field is left alone; a blank note clears it")
    void omissionMeansUnchangedAndTheNoteIsTheExceptionThatProvesIt() throws Exception {
        User author = member("9869000006", "Rohan Patch");
        String ops = staff("9869000007");
        String slug = society(author, "Vasant Vihar D244");

        edit(ops, slug, "{\"registration\":true,\"maintenancePerSqft\":2.75,"
                + "\"adminNote\":\"Registration certificate on file.\"}")
                .andExpect(status().isOk());

        edit(ops, slug, "{\"conveyance\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.registration").value(true))
                .andExpect(jsonPath("$.conveyance").value(true))
                .andExpect(jsonPath("$.maintenancePerSqft").value(2.75))
                .andExpect(jsonPath("$.adminNote").value("Registration certificate on file."));

        edit(ops, slug, "{\"adminNote\":\"   \"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.adminNote").doesNotExist());
        assertThat(row(slug).get("admin_note")).isNull();
    }

    @Test
    @DisplayName("a member cannot read the back-office view, note and all")
    void aMemberCannotReadTheNote() throws Exception {
        User author = member("9869000014", "Rohan Reader");
        String slug = society(author, "Cedar Court D244");

        edit(staff("9869000015"), slug, "{\"adminNote\":\"Secretary disputes the plot area.\"}")
                .andExpect(status().isOk());

        mvc.perform(get("/admin/societies/" + slug)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author)))
                .andExpect(status().isForbidden());

        mvc.perform(get("/admin/societies/" + slug))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("reading an unknown slug is a 404, not an empty society")
    void readingAnUnknownSlugIsNotFound() throws Exception {
        read(staff("9869000016"), "no-such-society-d244")
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a member cannot correct a society's facts")
    void aMemberIsRefused() throws Exception {
        User author = member("9869000008", "Sneha Member");
        String slug = society(author, "Green Acres D244");

        mvc.perform(patch("/admin/societies/" + slug)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"registration\":true}"))
                .andExpect(status().isForbidden());

        assertThat(row(slug).get("registration")).isEqualTo(false);
    }

    @Test
    @DisplayName("an unknown slug is a 404")
    void anUnknownSlugIsNotFound() throws Exception {
        edit(staff("9869000009"), "no-such-society-d244", "{\"registration\":true}")
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a maintenance rate that is really a monthly bill is refused")
    void maintenanceIsValidatedAsRupeesPerSquareFoot() throws Exception {
        User author = member("9869000010", "Kabir Rate");
        String ops = staff("9869000011");
        String slug = society(author, "Orchid Enclave D244");

        edit(ops, slug, "{\"maintenancePerSqft\":4500}")
                .andExpect(status().isUnprocessableEntity());

        edit(ops, slug, "{\"maintenancePerSqft\":-1}")
                .andExpect(status().isUnprocessableEntity());

        assertThat(row(slug).get("maintenance_per_sqft")).isNull();
    }
}

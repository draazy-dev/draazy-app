package com.draazy.api.security;

import com.draazy.api.support.AbstractApiTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("D67 — the stored permission map actually governs, and only downwards")
class PermissionMapGuardTest extends AbstractApiTest {
    private static final String ANY_ID = "11111111-1111-1111-1111-111111111111";

    @Autowired
    UserRepository users;

    private String bearer(String mobile, String role, String team) {
        User user = new User(mobile, role);
        user.setName("Capability probe");
        user.setTeam(team);
        user.setMobileVerified(true);
        User saved = users.saveAndFlush(user);
        if (Roles.Wire.STAFF.equals(role)) {
            String functions = team == null
                    ? "[\"analytics\"]"
                    : "[\"analytics\",\"support\",\"desk:" + team + "\"]";
            jdbc.update("""
                    INSERT INTO back_office_permissions (user_id, permissions)
                    VALUES (?::uuid, ?::jsonb)
                    """, saved.getId().toString(), functions);
        }
        return "Bearer " + jwtService.issueAccessToken(saved);
    }

    private void storePermissions(String json) {
        jdbc.update("UPDATE settings SET value = ?::jsonb WHERE key = 'permissions'", json);
    }

    private int dashboardStatus(String bearer) throws Exception {
        return mvc.perform(get(Routes.Admin.ANALYTICS_TRAFFIC).header(HttpHeaders.AUTHORIZATION, bearer))
                .andReturn().getResponse().getStatus();
    }

    private int ticketUpdateStatus(String bearer) throws Exception {
        return mvc.perform(patch(Routes.Tickets.BY_ID.replace("{id}", ANY_ID))
                        .header(HttpHeaders.AUTHORIZATION, bearer)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"open\"}"))
                .andReturn().getResponse().getStatus();
    }

    private int queueStatus(String bearer) throws Exception {
        return mvc.perform(get(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer))
                .andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("a desk that holds the capability is admitted")
    void heldCapabilityAdmits() throws Exception {
        String rental = bearer("9866010001", Roles.Wire.STAFF, Teams.RENTAL);

        assertThat(dashboardStatus(rental)).isEqualTo(200);
        assertThat(queueStatus(rental)).isEqualTo(200);
        assertThat(ticketUpdateStatus(rental)).isNotEqualTo(403);
    }

    @Test
    @DisplayName("the seeded document names every team the platform recognises, plus admin")
    void theSeededDocumentIsComplete() {
        String stored = jdbc.queryForObject(
                "SELECT value::text FROM settings WHERE key = 'permissions'", String.class);

        assertThat(stored).as("R__DML_seed_permission_map.sql did not run").isNotNull();
        assertThat(stored).contains(
                Teams.RENTAL, Teams.LEGAL, Teams.LOANS,
                Teams.INTERIOR, Teams.PACKERS, Teams.VALUATION, Roles.Wire.ADMIN);
    }

    @Test
    @DisplayName("removing a capability from a desk's bundle refuses that desk, and only it")
    void revokedCapabilityRefuses() throws Exception {
        String rental = bearer("9866010002", Roles.Wire.STAFF, Teams.RENTAL);
        String legal = bearer("9866010003", Roles.Wire.STAFF, Teams.LEGAL);
        storePermissions("""
                {
                  "rental": ["view_service_requests"],
                  "legal":  ["view_dashboard", "view_service_requests", "update_ticket"],
                  "admin":  ["*"]
                }""");

        assertThat(dashboardStatus(rental)).as("dashboard is no longer desk-scoped").isEqualTo(200);
        assertThat(ticketUpdateStatus(rental)).as("rental lost update_ticket").isEqualTo(403);
        assertThat(queueStatus(rental)).as("rental kept view_service_requests").isEqualTo(200);
        assertThat(dashboardStatus(legal)).as("legal was not touched").isEqualTo(200);
    }

    @Test
    @DisplayName("the map cannot widen: granting a capability to a buyer changes nothing")
    void theMapCannotWidenTheRoleBaseline() throws Exception {
        String buyer = bearer("9866010004", Roles.Wire.BUYER, null);
        storePermissions("""
                {
                  "buyer":  ["view_dashboard", "update_ticket", "*"],
                  "rental": ["view_dashboard", "view_service_requests", "update_ticket"],
                  "admin":  ["*"]
                }""");

        assertThat(dashboardStatus(buyer)).isEqualTo(403);
        assertThat(ticketUpdateStatus(buyer)).isEqualTo(403);
    }

    @Test
    @DisplayName("the admin bundle's wildcard grants every capability")
    void wildcardGrantsEverything() throws Exception {
        String admin = bearer("9866010005", Roles.Wire.ADMIN, null);
        storePermissions("{\"admin\":[\"*\"]}");

        assertThat(dashboardStatus(admin)).isEqualTo(200);
        assertThat(queueStatus(admin)).isEqualTo(200);
        assertThat(ticketUpdateStatus(admin)).isNotEqualTo(403);
    }

    @Test
    @DisplayName("a desk the document does not mention is refused")
    void omittedDeskIsRefused() throws Exception {
        String packers = bearer("9866010006", Roles.Wire.STAFF, Teams.PACKERS);
        storePermissions("{\"rental\":[\"view_dashboard\"],\"admin\":[\"*\"]}");

        assertThat(dashboardStatus(packers)).isEqualTo(200);
        assertThat(queueStatus(packers)).isEqualTo(403);
    }

    @Test
    @DisplayName("no permission document falls back to the role baseline, not to a lockout")
    void absentDocumentFallsBackToTheRoleBaseline() throws Exception {
        String packers = bearer("9866010007", Roles.Wire.STAFF, Teams.PACKERS);
        jdbc.update("DELETE FROM settings WHERE key = 'permissions'");

        assertThat(dashboardStatus(packers)).isEqualTo(200);
        assertThat(queueStatus(packers)).isEqualTo(200);
    }

    @Test
    @DisplayName("a permission document that is not an object falls back to the role baseline")
    void malformedDocumentFallsBackToTheRoleBaseline() throws Exception {
        String packers = bearer("9866010008", Roles.Wire.STAFF, Teams.PACKERS);
        storePermissions("\"not a permission map\"");

        assertThat(dashboardStatus(packers)).isEqualTo(200);
    }

    @Test
    @DisplayName("staff with no team are refused: a governed document has no way to name them")
    void teamlessStaffAreRefusedByAGovernedDocument() throws Exception {
        String unassigned = bearer("9866010009", Roles.Wire.STAFF, null);
        String rental = bearer("9866010011", Roles.Wire.STAFF, Teams.RENTAL);
        storePermissions("{\"rental\":[\"view_dashboard\"],\"admin\":[\"*\"]}");

        assertThat(dashboardStatus(unassigned))
                .as("dashboard is always-on for back-office accounts")
                .isEqualTo(200);
        assertThat(queueStatus(unassigned))
                .as("a deskless caller must not out-rank a desked one by seeing every desk")
                .isEqualTo(403);
        assertThat(dashboardStatus(rental))
                .as("the same document still admits the desk it does name")
                .isEqualTo(200);
    }

    @Test
    @DisplayName("with no document at all, team-less staff fall back to the baseline like anyone else")
    void teamlessStaffStillSurviveAnAbsentDocument() throws Exception {
        String unassigned = bearer("9866010012", Roles.Wire.STAFF, null);
        jdbc.update("DELETE FROM settings WHERE key = 'permissions'");

        assertThat(dashboardStatus(unassigned)).isEqualTo(200);
    }

    @Test
    @DisplayName("a customer's own service-request list is untouched by the permission map")
    void customersAreUnaffectedByTheOpsCapability() throws Exception {
        String buyer = bearer("9866010010", Roles.Wire.BUYER, null);
        storePermissions("{\"admin\":[\"*\"]}");

        assertThat(queueStatus(buyer)).isEqualTo(200);
    }
}

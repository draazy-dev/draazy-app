package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

@DisplayName("Mass assignment - server-owned fields in a request body are ignored")
class MassAssignmentTest extends AbstractSecurityTest {

    private static final String BUYER = "buyer";
    private static final String OWNER = "owner";

    @Autowired
    PropertyRepository properties;

    private String injectedListingFields(User victim) {
        return "\"ownerId\":\"" + victim.getId() + "\",\"status\":\"approved\",\"verified\":true,"
                + "\"ownershipVerified\":true,\"archived\":true,\"featured\":true,"
                + "\"createdAt\":\"2000-01-01T00:00:00Z\"";
    }

    private Map<String, Object> userRow(UUID id) {
        em.flush();
        return jdbc.queryForMap("select id, role, verified, mobile_verified, status, name from users where id = ?", id);
    }

    @Test
    @DisplayName("PATCH /auth/me ignores role, verified, mobileVerified and id, and the account is still not an admin")
    void profileUpdateCannotEscalate() throws Exception {
        User u = user("9898200001", BUYER);
        Map<String, Object> before = userRow(u.getId());

        mvc.perform(patch(Routes.Auth.ME).header(HttpHeaders.AUTHORIZATION, bearer(u)).contentType(JSON)
                        .content("{\"name\":\"Mass Test\",\"role\":\"admin\",\"verified\":true,"
                                + "\"mobileVerified\":false,\"id\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isOk());

        Map<String, Object> after = userRow(u.getId());
        assertThat(after.get("name")).isEqualTo("Mass Test");
        assertThat(after).containsEntry("id", before.get("id")).containsEntry("role", BUYER)
                .containsEntry("verified", before.get("verified"))
                .containsEntry("mobile_verified", true).containsEntry("status", before.get("status"));

        em.clear();
        User fresh = users.findById(u.getId()).orElseThrow();
        mvc.perform(get(Routes.Admin.FINANCE).header(HttpHeaders.AUTHORIZATION, bearer(fresh)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /me/listings ignores injected owner, status, verification, archive, featured and createdAt")
    void listingCreateIgnoresServerOwnedFields() throws Exception {
        User caller = user("9898200002", OWNER);
        User victim = user("9898200003", OWNER);
        User control = user("9898200004", OWNER);
        String clean = "{\"title\":\"%s\",\"deal\":\"rent\",\"propertyType\":\"apartment\",\"price\":25000,"
                + "\"locality\":\"Kothrud\",\"city\":\"Pune\",%s%s}";

        String controlId = idOf(mvc.perform(post(Routes.MeListings.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(control)).contentType(JSON)
                        .content(clean.formatted("Control flat", listingImages(control), "")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = idOf(mvc.perform(post(Routes.MeListings.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)).contentType(JSON)
                        .content(clean.formatted("Injected flat", listingImages(caller),
                                "," + injectedListingFields(victim))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        em.flush();
        Map<String, Object> stored = jdbc.queryForMap("""
                select owner_id, status, verified, ownership_verified, featured, archived_at is null as live,
                       created_at > now() - interval '1 day' as fresh
                from properties where id = ?::uuid""", id);
        String controlStatus = jdbc.queryForObject("select status from properties where id = ?::uuid",
                String.class, controlId);
        assertThat(stored).containsEntry("owner_id", caller.getId()).containsEntry("status", controlStatus)
                .containsEntry("verified", false).containsEntry("ownership_verified", false)
                .containsEntry("featured", false).containsEntry("live", true).containsEntry("fresh", true);
        assertThat(controlStatus).isNotIn(PropertyStatus.APPROVED, PropertyStatus.ARCHIVED);
    }

    @Test
    @DisplayName("PATCH /me/listings/{id} ignores injected owner, status, verification, archive, featured and createdAt")
    void listingUpdateIgnoresServerOwnedFields() throws Exception {
        User caller = user("9898200005", OWNER);
        User victim = user("9898200006", OWNER);
        Property p = new Property(caller, "2BHK in Kothrud", "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setStatus(PropertyStatus.PENDING);
        p = properties.saveAndFlush(p);
        Object createdAt = jdbc.queryForObject("select created_at from properties where id = ?", Object.class, p.getId());

        mvc.perform(patch(Routes.MeListings.BY_ID, p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(JSON)
                        .content("{\"title\":\"Edited title\"," + injectedListingFields(victim) + "}"))
                .andExpect(status().isOk());

        em.flush();
        Map<String, Object> stored = jdbc.queryForMap("""
                select owner_id, status, title, verified, ownership_verified, featured, created_at,
                       archived_at is null as live
                from properties where id = ?""", p.getId());
        assertThat(stored).containsEntry("owner_id", caller.getId()).containsEntry("title", "Edited title")
                .containsEntry("status", PropertyStatus.PENDING).containsEntry("verified", false)
                .containsEntry("ownership_verified", false).containsEntry("featured", false)
                .containsEntry("created_at", createdAt).containsEntry("live", true);
    }

    @Test
    @DisplayName("POST /service-requests ignores an injected status and user and files the request as the caller's")
    void serviceRequestCreateIgnoresStatusAndUser() throws Exception {
        User caller = user("9898200007", BUYER);
        User victim = user("9898200008", BUYER);
        User control = user("9898200009", BUYER);

        String controlId = idOf(mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(control)).contentType(JSON)
                        .content("{\"type\":\"legal\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = idOf(mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)).contentType(JSON)
                        .content("{\"type\":\"legal\",\"status\":\"paid\",\"userId\":\"" + victim.getId()
                                + "\",\"requesterId\":\"" + victim.getId() + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        em.flush();
        Map<String, Object> stored = jdbc.queryForMap(
                "select requester_id, status from service_requests where id = ?::uuid", id);
        String controlStatus = jdbc.queryForObject("select status from service_requests where id = ?::uuid",
                String.class, controlId);
        assertThat(stored).containsEntry("requester_id", caller.getId()).containsEntry("status", controlStatus);
        assertThat(controlStatus).isNotEqualTo("paid");
    }

    @Test
    @DisplayName("POST /flatmates/posts ignores injected moderation status, verified and owner")
    void seekerPostCreateIgnoresServerOwnedFields() throws Exception {
        User caller = user("9898200010", BUYER);
        User victim = user("9898200011", BUYER);
        User control = user("9898200012", BUYER);
        String clean = "{\"name\":\"Asha\",\"budget\":18000,\"localities\":[\"Baner\"],\"moveIn\":\"2026-09-01\"%s}";

        String controlId = idOf(mvc.perform(post(Routes.Flatmates.POSTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(control)).contentType(JSON)
                        .content(clean.formatted("")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        String id = idOf(mvc.perform(post(Routes.Flatmates.POSTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)).contentType(JSON)
                        .content(clean.formatted(",\"modStatus\":\"live\",\"verified\":true,\"userId\":\""
                                + victim.getId() + "\",\"ownerId\":\"" + victim.getId() + "\"")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());

        em.flush();
        Map<String, Object> stored = jdbc.queryForMap(
                "select user_id, mod_status, verified from flatmate_seeker_posts where id = ?::uuid", id);
        String controlModStatus = jdbc.queryForObject(
                "select mod_status from flatmate_seeker_posts where id = ?::uuid", String.class, controlId);
        assertThat(stored).containsEntry("user_id", caller.getId()).containsEntry("mod_status", controlModStatus)
                .containsEntry("verified", false);
    }

    private String raiseTicket(User caller, String body) throws Exception {
        return idOf(mvc.perform(post(Routes.Tickets.BASE).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    @Test
    @DisplayName("POST /tickets by a customer ignores status, assignee, requester and the staff deal value")
    void ticketCreateIgnoresStaffOwnedFields() throws Exception {
        User caller = user("9898200013", BUYER);
        User victim = user("9898200014", BUYER);

        String id = raiseTicket(caller, "{\"subject\":\"Need a visit\",\"team\":\"rental\",\"status\":\"closed\","
                + "\"assigneeId\":\"" + victim.getId() + "\",\"requesterId\":\"" + victim.getId()
                + "\",\"value\":99900000,\"service\":\"premium\"}");

        em.flush();
        Map<String, Object> stored = jdbc.queryForMap(
                "select requester_id, assignee_id, status, value, service from tickets where id = ?::uuid", id);
        assertThat(stored).containsEntry("requester_id", caller.getId()).containsEntry("status", "open")
                .containsEntry("assignee_id", null).containsEntry("value", null).containsEntry("service", null);
    }

    @Test
    @DisplayName("POST /tickets by a customer cannot set the staff triage priority")
    void ticketCreateCannotSetPriority() throws Exception {
        User caller = user("9898200015", BUYER);

        String id = raiseTicket(caller, "{\"subject\":\"Jump the queue\",\"priority\":\"urgent\"}");

        em.flush();
        assertThat(jdbc.queryForObject("select priority from tickets where id = ?::uuid", String.class, id))
                .isEqualTo("medium");
    }

    @Test
    @DisplayName("POST /tickets by a customer cannot route to a desk that does not exist")
    void ticketCreateRefusesAnUnknownTeam() throws Exception {
        User caller = user("9898200016", BUYER);

        mvc.perform(post(Routes.Tickets.BASE).header(HttpHeaders.AUTHORIZATION, bearer(caller)).contentType(JSON)
                        .content("{\"subject\":\"Bad desk\",\"team\":\"admin\"}"))
                .andExpect(status().isBadRequest());
    }
}

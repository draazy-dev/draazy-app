package com.draazy.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Moderation — what the audit trail and the owner are told")
class ModerationRecordTest extends AbstractApiTest {

    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;

    private final List<String> createdActors = new ArrayList<>();

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        createdActors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        createdActors.clear();
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("User " + mobile);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        if ("staff".equals(role)) {
            jdbc.update("""
                    INSERT INTO back_office_permissions (user_id, permissions)
                    VALUES (?::uuid, ?::jsonb)
                    ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions
                    """, saved.getId().toString(),
                    "[\"kyc\",\"propertyVerification\",\"listingModeration\",\"support\",\"content\",\"reports\"]");
        }
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private Property listing(User owner, String deal) {
        Property p = new Property(owner, "2BHK in Baner", deal, "apartment", 28000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("950"));
        p.setStatus(PropertyStatus.PENDING);
        p.setLocalitySlug("baner");
        return properties.saveAndFlush(p);
    }

    private Property listing(User owner) {
        return listing(owner, "rent");
    }

    private void ready(Property listing, User staff) throws Exception {
        String opened = mvc.perform(post("/properties/{id}/verification/start", listing.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        List<String> items = com.jayway.jsonpath.JsonPath.read(opened, "$.checklist[*].item");
        for (String item : items) {
            mvc.perform(patch("/properties/{id}/verification/checklist", listing.getId())
                            .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"item\":\"" + item + "\",\"pass\":true}"))
                    .andExpect(status().isOk());
        }
    }

    private void json(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            User as, String body, int expectedStatus) throws Exception {
        mvc.perform(request.header(HttpHeaders.AUTHORIZATION, bearer(as))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus));
    }

    private void decide(Property listing, User staff, String body, int expectedStatus) throws Exception {
        json(post("/properties/{id}/verification/decision", listing.getId()), staff, body, expectedStatus);
    }

    private void setStatus(Property listing, User staff, String body, int expectedStatus) throws Exception {
        json(patch("/properties/{id}/status", listing.getId()), staff, body, expectedStatus);
    }

    private List<Map<String, Object>> auditRows(String action, Object entityId) {
        return jdbc.queryForList(
                "select * from audit_log where action = ? and entity_id = ? order by at desc",
                action, String.valueOf(entityId));
    }

    private String metadata(Map<String, Object> row, String key) {
        return jdbc.queryForObject("select metadata->>? from audit_log where id = ?", String.class, key, row.get("id"));
    }

    private List<Map<String, Object>> notices(User to, String type) {
        return jdbc.queryForList("select * from notifications where user_id = ? and type = ?",
                to.getId(), type);
    }

    private Property liveSibling(User owner) {
        Property live = listing(owner);
        live.setStatus(PropertyStatus.APPROVED);
        return properties.saveAndFlush(live);
    }

    @Test
    @DisplayName("archive and restore each leave an audit row with actor, reason and from/to")
    void archiveAndRestoreAreAudited() throws Exception {
        User owner = user("9891200001", "owner");
        User staff = user("9891200002", "staff");
        Property listing = listing(owner);

        json(patch("/properties/{id}/archive", listing.getId()), staff, "{\"reason\":\"stale photos\"}", 200);
        Map<String, Object> archived = auditRows("property.archive", listing.getId()).get(0);
        assertThat(archived.get("actor")).isEqualTo(staff.getId().toString());
        assertThat(metadata(archived, "reason")).isEqualTo("stale photos");
        assertThat(metadata(archived, "from")).isEqualTo("pending");
        assertThat(metadata(archived, "to")).isEqualTo("archived");

        json(patch("/properties/{id}/restore", listing.getId()), staff, "{}", 200);
        Map<String, Object> restored = auditRows("property.restore", listing.getId()).get(0);
        assertThat(restored.get("actor")).isEqualTo(staff.getId().toString());
        assertThat(metadata(restored, "from")).isEqualTo("archived");
        assertThat(metadata(restored, "to")).isEqualTo("pending");
    }

    @Test
    @DisplayName("staff archiving a listing tells its owner once; an owner archiving their own does not")
    void staffArchiveNotifiesTheOwner() throws Exception {
        User owner = user("9891200003", "owner");
        User staff = user("9891200004", "staff");
        Property byStaff = listing(owner);
        Property byOwner = listing(owner);

        json(patch("/properties/{id}/archive", byOwner.getId()), owner, "{\"reason\":\"sold\"}", 200);
        assertThat(notices(owner, "listing.archived")).isEmpty();

        json(patch("/properties/{id}/archive", byStaff.getId()), staff, "{\"reason\":\"stale photos\"}", 200);
        List<Map<String, Object>> told = notices(owner, "listing.archived");
        assertThat(told).hasSize(1);
        assertThat((String) told.get(0).get("body")).contains("2BHK in Baner");
    }

    @Test
    @DisplayName("a free-tier approval that lands paused is audited as paused, and the thread does not say live")
    void freeTierApprovalIsHonestEverywhere() throws Exception {
        User owner = user("9891200005", "owner");
        User staff = user("9891200006", "staff");
        liveSibling(owner);
        Property second = listing(owner);
        ready(second, staff);

        decide(second, staff, "{\"decision\":\"approve\",\"note\":\"ok\"}", 200);

        Map<String, Object> row = auditRows("property.verification.decision", second.getId()).get(0);
        assertThat(metadata(row, "from")).isEqualTo("pending");
        assertThat(metadata(row, "to")).isEqualTo("paused");
        String thread = mvc.perform(get("/properties/{id}/verification", second.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].read").value(true))
                .andReturn().getResponse().getContentAsString();
        assertThat(thread).doesNotContain("now live");
        Map<String, Object> told = notices(owner, "listing.approved_paused").get(0);
        assertThat((String) told.get("body")).contains("2BHK in Baner", "Baner");
        assertThat(told.get("link")).isEqualTo("/dashboard?review=" + second.getId());
    }

    @Test
    @DisplayName("a queue approval over the free tier records the final status as `to`")
    void queueApprovalAuditsTheFinalStatus() throws Exception {
        User owner = user("9891200007", "owner");
        User staff = user("9891200008", "staff");
        liveSibling(owner);
        Property second = listing(owner);
        ready(second, staff);

        setStatus(second, staff, "{\"status\":\"approved\",\"reason\":\"docs verified\"}", 200);

        Map<String, Object> row = auditRows("property.status", second.getId()).get(0);
        assertThat(metadata(row, "from")).isEqualTo("pending");
        assertThat(metadata(row, "to")).isEqualTo("paused");
    }

    @Test
    @DisplayName("approving a listing that is already live with no re-check changes nothing")
    void reapprovingALiveListingIsANoOp() throws Exception {
        User owner = user("9891200009", "owner");
        User staff = user("9891200010", "staff");
        Property listing = listing(owner);
        ready(listing, staff);
        setStatus(listing, staff, "{\"status\":\"approved\"}", 200);

        setStatus(listing, staff, "{\"status\":\"approved\",\"expectedStatus\":\"approved\"}", 200);

        assertThat(auditRows("property.status", listing.getId())).hasSize(1);
        assertThat(notices(owner, "listing.approved")).hasSize(1);
    }

    @Test
    @DisplayName("a rejection names the listing, links to it and keeps the note apart from the finality line")
    void rejectionNoticeNamesTheListing() throws Exception {
        User owner = user("9891200011", "owner");
        User staff = user("9891200012", "staff");
        Property listing = listing(owner);

        setStatus(listing, staff,
                "{\"status\":\"rejected\",\"reasonCode\":\"wrong_details\",\"reason\":\"Rent is wrong\"}", 200);

        Map<String, Object> told = notices(owner, "listing.rejected").get(0);
        String body = (String) told.get("body");
        assertThat(body).contains("2BHK in Baner").contains("Rent is wrong\nThis decision is final.");
        assertThat(told.get("link")).isEqualTo("/dashboard?review=" + listing.getId());
        mvc.perform(get("/properties/{id}/verification", listing.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.messages[0].body").value(
                        "\u26D4 Your property could not be approved.\nReason: "
                                + "The listing contains inaccurate details. Rent is wrong\n"
                                + "This decision is final. The listing cannot be resubmitted."))
                .andExpect(jsonPath("$.progress.step").value("submitted"));
    }

    @Test
    @DisplayName("an approval is announced with the listing's name and links to the listing")
    void approvalNoticeNamesTheListing() throws Exception {
        User owner = user("9891200013", "owner");
        User staff = user("9891200014", "staff");
        Property listing = listing(owner);
        ready(listing, staff);

        decide(listing, staff, "{\"decision\":\"approve\"}", 200);

        Map<String, Object> told = notices(owner, "listing.approved").get(0);
        assertThat((String) told.get("body")).contains("2BHK in Baner");
        assertThat(told.get("link")).isEqualTo("/property/" + listing.getId());
    }

    @Test
    @DisplayName("an approved listing's thread carries no unread message from the desk")
    void approvalMessageIsNotAnOutstandingQuestion() throws Exception {
        User owner = user("9891200015", "owner");
        User staff = user("9891200016", "staff");
        Property listing = listing(owner);
        ready(listing, staff);

        decide(listing, staff, "{\"decision\":\"approve\"}", 200);

        mvc.perform(get("/me/property-reviews").header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].unread").value(0));
    }

    @Test
    @DisplayName("a second approver reopening a final rejection tells the owner it is back under review")
    void reopenedRejectionNotifiesTheOwner() throws Exception {
        User owner = user("9891200017", "owner");
        User ops = user("9891200018", "staff");
        User peer = user("9891200019", "staff");
        Property listing = listing(owner);
        setStatus(listing, ops, "{\"status\":\"rejected\",\"reasonCode\":\"wrong_details\"}", 200);

        String response = mvc.perform(post("/properties/{id}/verification/override-requests", listing.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(ops))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Owner appeal has evidence\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String requestId = com.jayway.jsonpath.JsonPath.read(response, "$.overrideRequest.id");

        assertThat(auditRows("property.verification.override.requested", listing.getId())).hasSize(1);
        json(post("/properties/{id}/verification/override-requests/" + requestId + "/approve", listing.getId()),
                peer, "{\"note\":\"reopen\"}", 200);

        assertThat(auditRows("property.verification.override.approved", listing.getId())).hasSize(1);
        Map<String, Object> told = notices(owner, "listing.reopened").get(0);
        assertThat((String) told.get("body")).contains("2BHK in Baner");
        assertThat(told.get("link")).isEqualTo("/dashboard?review=" + listing.getId());
    }

    @Test
    @DisplayName("granting the ownership badge tells the owner")
    void badgeGrantNotifiesTheOwner() throws Exception {
        User owner = user("9891200020", "owner");
        User staff = user("9891200021", "staff");
        Property listing = listing(owner, "buy");
        String ownership = "/properties/" + listing.getId() + "/verification/ownership";
        json(post(ownership + "/evidence"), staff,
                "{\"docType\":\"index_ii\",\"issuedOn\":\"" + LocalDate.now().minusDays(5) + "\"}", 201);

        mvc.perform(post(ownership).header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk());

        List<Map<String, Object>> told = notices(owner, "listing.badge_verified");
        assertThat(told).hasSize(1);

        mvc.perform(post(ownership).header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk());
        assertThat(notices(owner, "listing.badge_verified")).hasSize(1);
    }

    @Test
    @DisplayName("unflagging tells the owner, and a blank flag reason is refused")
    void flagNeedsAReasonAndUnflagNotifies() throws Exception {
        User owner = user("9891200022", "owner");
        User staff = user("9891200023", "staff");
        Property listing = liveSibling(owner);

        json(post("/properties/{id}/flag", listing.getId()), staff, "{\"reason\":\"  \"}", 422);
        json(post("/properties/{id}/flag", listing.getId()), staff, "{}", 422);
        json(post("/properties/{id}/flag", listing.getId()), staff, "{\"reason\":\"duplicate photos\"}", 200);

        mvc.perform(delete("/properties/{id}/flag", listing.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isNoContent());

        assertThat(notices(owner, "listing.unflagged")).hasSize(1);
    }

    @Test
    @DisplayName("a staff correction records before/after of the changed fields and tells the owner")
    void adminEditRecordsTheChangeAndNotifies() throws Exception {
        User owner = user("9891200024", "owner");
        User staff = user("9891200025", "staff");
        Property listing = liveSibling(owner);

        json(patch("/properties/{id}/admin", listing.getId()), staff, "{\"price\":26000}", 200);

        Map<String, Object> row = auditRows("property.adminUpdate", listing.getId()).get(0);
        assertThat(metadata(row, "changes")).contains("price").contains("28000").contains("26000");
        assertThat(notices(owner, "listing.edited_by_staff")).hasSize(1);
    }

    @Test
    @DisplayName("a verification decision on an unconfirmed on-behalf listing is a 409, not a 404, before any review exists")
    void unconfirmedOnBehalfApprovalIsRefusedWithTheRightCode() throws Exception {
        User owner = user("9891200026", "owner");
        User staff = user("9891200027", "staff");
        User poster = user("9891200028", "staff");
        Property listing = listing(owner);
        listing.markPostedOnBehalf(poster.getId().toString());
        properties.saveAndFlush(listing);

        mvc.perform(post("/properties/{id}/verification/decision", listing.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"approve\",\"expectedStatus\":\"pending\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("owner_not_confirmed"));
    }

    @Test
    @DisplayName("the loser of a decision race gets stale_decision; an archived listing with no case stays a 409")
    void staleDecisionIsNamedAsSuch() throws Exception {
        User owner = user("9891200029", "owner");
        User staff = user("9891200030", "staff");
        Property raced = listing(owner);
        ready(raced, staff);
        decide(raced, staff, "{\"decision\":\"reject\",\"reasonCode\":\"broker\"}", 200);

        mvc.perform(post("/properties/{id}/verification/decision", raced.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"approve\",\"expectedStatus\":\"in_review\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("stale_decision"));

        Property archived = listing(owner);
        archived.archive("gone");
        properties.saveAndFlush(archived);
        decide(archived, staff, "{\"decision\":\"approve\",\"expectedStatus\":\"pending\"}", 409);
    }
}

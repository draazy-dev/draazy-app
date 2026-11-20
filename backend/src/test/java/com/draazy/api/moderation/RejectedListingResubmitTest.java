package com.draazy.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.documents.vault.Document;
import com.draazy.api.documents.vault.DocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Rejected listings - only a fixable reason can be edited and resubmitted")
class RejectedListingResubmitTest extends AbstractApiTest {

    private static final String EDIT = "{\"description\":\"Fresh description with the details a reviewer asked for.\"}";

    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @Autowired
    DocumentRepository documents;

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
        if (Roles.Wire.STAFF.equals(role)) {
            jdbc.update("""
                    INSERT INTO back_office_permissions (user_id, permissions)
                    VALUES (?::uuid, ?::jsonb)
                    ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions
                    """, saved.getId().toString(),
                    "[\"kyc\",\"propertyVerification\",\"listingModeration\",\"support\",\"content\",\"reports\",\"desk:rental\"]");
        }
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "2BHK in Kothrud", "rent", "apartment", 32000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("900"));
        p.setStatus(PropertyStatus.PENDING);
        p.setLocalitySlug(jdbc.queryForObject("select slug from localities limit 1", String.class));
        p = properties.saveAndFlush(p);
        documents.saveAndFlush(new Document(p.getId(), "Not a duplicate of another listing",
                "proof.pdf", "test/verification-proof", 100, "application/pdf"));
        return p;
    }

    private String caseFile(Property p) {
        return "/properties/" + p.getId() + "/verification";
    }

    private void rejectWith(Property p, User owner, User ops, String reasonCode) throws Exception {
        mvc.perform(post(caseFile(p)).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isCreated());
        mvc.perform(post(caseFile(p) + "/decision").header(HttpHeaders.AUTHORIZATION, bearer(ops))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"reject\",\"reasonCode\":\"" + reasonCode + "\"}"))
                .andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions edit(User owner, Property p) throws Exception {
        return mvc.perform(patch("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                .contentType(MediaType.APPLICATION_JSON).content(EDIT));
    }

    private void tickEverything(Property p, User ops) throws Exception {
        String body = mvc.perform(get(caseFile(p)).header(HttpHeaders.AUTHORIZATION, bearer(ops)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        List<String> items = com.jayway.jsonpath.JsonPath.read(body, "$.checklist[*].item");
        for (String item : items) {
            mvc.perform(patch(caseFile(p) + "/checklist").header(HttpHeaders.AUTHORIZATION, bearer(ops))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"item\":\"" + item + "\",\"pass\":true}"))
                    .andExpect(status().isOk());
        }
    }

    @Test
    @DisplayName("a fixable rejection can be edited: it goes back to pending and the owner is told")
    void fixableRejectionIsEditableAndGoesBackToReview() throws Exception {
        User owner = user("9820000701", Roles.Wire.OWNER);
        User ops = user("9820000702", Roles.Wire.STAFF);
        Property p = listing(owner);
        rejectWith(p, owner, ops, "photos_not_real");

        mvc.perform(get("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(PropertyStatus.REJECTED));
        edit(owner, p).andExpect(status().isOk());

        Property saved = properties.findById(p.getId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(PropertyStatus.PENDING);
        assertThat(saved.getResubmittedAt()).isNotNull();
        mvc.perform(get(caseFile(p)).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.status").value("in_review"))
                .andExpect(jsonPath("$.messages[-1:].body")
                        .value("Thanks \u2014 your changes have gone back to our review desk."));
    }

    @Test
    @DisplayName("a resubmitted listing is a live case again: a moderator can approve it")
    void resubmittedListingCanBeApproved() throws Exception {
        User owner = user("9820000703", Roles.Wire.OWNER);
        User ops = user("9820000704", Roles.Wire.STAFF);
        Property p = listing(owner);
        rejectWith(p, owner, ops, "wrong_details");
        edit(owner, p).andExpect(status().isOk());

        tickEverything(p, ops);
        mvc.perform(post(caseFile(p) + "/decision").header(HttpHeaders.AUTHORIZATION, bearer(ops))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"decision\":\"approve\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("approved"));
        assertThat(properties.findById(p.getId()).orElseThrow().getStatus()).isEqualTo(PropertyStatus.APPROVED);
    }

    @Test
    @DisplayName("a resubmitted listing can be rejected again without a stale_decision")
    void resubmittedListingCanBeRejectedAgain() throws Exception {
        User owner = user("9820000705", Roles.Wire.OWNER);
        User ops = user("9820000706", Roles.Wire.STAFF);
        Property p = listing(owner);
        rejectWith(p, owner, ops, "locality_unclear");
        edit(owner, p).andExpect(status().isOk());

        mvc.perform(post(caseFile(p) + "/decision").header(HttpHeaders.AUTHORIZATION, bearer(ops))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"reject\",\"reasonCode\":\"duplicate\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("rejected"));
        edit(owner, p).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("listing_not_editable"));
    }

    @Test
    @DisplayName("a final rejection (duplicate) stays closed to edits")
    void finalRejectionStaysClosed() throws Exception {
        User owner = user("9820000707", Roles.Wire.OWNER);
        User ops = user("9820000708", Roles.Wire.STAFF);
        Property p = listing(owner);
        rejectWith(p, owner, ops, "duplicate");

        edit(owner, p).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("listing_not_editable"));
        Property saved = properties.findById(p.getId()).orElseThrow();
        assertThat(saved.getStatus()).isEqualTo(PropertyStatus.REJECTED);
        assertThat(saved.getResubmittedAt()).isNull();
    }

    @Test
    @DisplayName("a rejection made from the moderation desk status route is resubmittable too")
    void rejectionFromTheStatusRouteIsResubmittable() throws Exception {
        User owner = user("9820000709", Roles.Wire.OWNER);
        User ops = user("9820000710", Roles.Wire.STAFF);
        Property p = listing(owner);
        mvc.perform(patch("/properties/{id}/status", p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(ops))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"rejected\",\"reasonCode\":\"name_mismatch\"}"))
                .andExpect(status().isOk());

        edit(owner, p).andExpect(status().isOk());
        assertThat(properties.findById(p.getId()).orElseThrow().getStatus()).isEqualTo(PropertyStatus.PENDING);
        mvc.perform(patch("/properties/{id}/status", p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(ops))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"rejected\",\"reasonCode\":\"broker\"}"))
                .andExpect(status().isOk());
    }
}
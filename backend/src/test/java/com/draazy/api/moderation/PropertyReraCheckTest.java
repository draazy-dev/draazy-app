package com.draazy.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("Moderation — staff check the RERA ID on MahaRERA")
class PropertyReraCheckTest extends AbstractApiTest {

    private static final String RERA_ITEM = "RERA ID checked on MahaRERA";
    private static final String[] BASE_ITEMS = {
            "Photos are real and match the listing",
            "Not a duplicate of another listing",
            "Details and location look right"};

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;

    // Audit rows commit through REQUIRES_NEW, so a rollback does not take them with it.
    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        jdbc.update("delete from audit_log where action like 'property.rera.%'");
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Rera " + mobile);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String reraId) {
        Property p = new Property(owner, "Rera flat", "buy", "apartment", 9500000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setArea(new BigDecimal("950"));
        p.setStatus(PropertyStatus.PENDING);
        p.setLocalitySlug("baner");
        p.setReraId(reraId);
        return properties.saveAndFlush(p);
    }

    private ResultActions send(MockHttpServletRequestBuilder builder, User actor, String body) throws Exception {
        return mvc.perform(builder.header(HttpHeaders.AUTHORIZATION, bearer(actor))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions rera(User actor, Property p, String result) throws Exception {
        return send(post("/properties/" + p.getId() + "/rera-check"), actor, "{\"result\":\"" + result + "\"}");
    }

    private void tickBaseItems(User staff, Property p) throws Exception {
        send(post("/properties/" + p.getId() + "/verification/start"), staff, "{}").andExpect(status().isOk());
        for (String item : BASE_ITEMS) {
            send(patch("/properties/" + p.getId() + "/verification/checklist"), staff,
                    "{\"item\":\"" + item + "\",\"pass\":true}").andExpect(status().isOk());
        }
    }

    private ResultActions decide(User staff, Property p, String body) throws Exception {
        return send(post("/properties/" + p.getId() + "/verification/decision"), staff, body);
    }

    @Test
    @DisplayName("the RERA item appears only on a listing that quotes a RERA ID")
    void checklistItemOnlyWhenQuoted() throws Exception {
        User owner = user("9870000001", "owner");
        User staff = user("9870000002", "staff");
        Property quoted = listing(owner, "P52100012345");
        Property plain = listing(owner, null);

        send(post("/properties/" + quoted.getId() + "/verification/start"), staff, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checklist.length()").value(4))
                .andExpect(jsonPath("$.checklist[3].item").value(RERA_ITEM))
                .andExpect(jsonPath("$.checklist[3].pass").value(false));
        send(post("/properties/" + plain.getId() + "/verification/start"), staff, "{}")
                .andExpect(jsonPath("$.checklist.length()").value(3));
        rera(staff, plain, "verified").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("not found or mismatch blocks Approve with a clear message; Verified lets it through")
    void gateRule() throws Exception {
        User owner = user("9870000003", "owner");
        User staff = user("9870000004", "staff");
        Property p = listing(owner, "P52100012345");
        tickBaseItems(staff, p);

        decide(staff, p, "{\"decision\":\"approve\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("rera_check_pending"));

        rera(staff, p, "not_found").andExpect(status().isOk())
                .andExpect(jsonPath("$.reraCheck").value("not_found"))
                .andExpect(jsonPath("$.checklist[3].pass").value(false));
        decide(staff, p, "{\"decision\":\"approve\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("rera_check_failed"))
                .andExpect(content().string(containsString("not found on MahaRERA")));

        rera(staff, p, "mismatch").andExpect(status().isOk());
        decide(staff, p, "{\"decision\":\"approve\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("rera_check_failed"))
                .andExpect(content().string(containsString("does not match")));
        send(patch("/properties/" + p.getId() + "/status"), staff, "{\"status\":\"approved\"}")
                .andExpect(status().isConflict());

        rera(staff, p, "verified").andExpect(status().isOk())
                .andExpect(jsonPath("$.checklist[3].pass").value(true));
        decide(staff, p, "{\"decision\":\"approve\"}").andExpect(status().isOk());
        assertThat(properties.findById(p.getId()).orElseThrow().getStatus()).isEqualTo(PropertyStatus.APPROVED);
    }

    @Test
    @DisplayName("a failed check can still be sent back to the owner with the RERA reason")
    void failedCheckSendsBackWithReason() throws Exception {
        User owner = user("9870000005", "owner");
        User staff = user("9870000006", "staff");
        Property p = listing(owner, "P52100012345");
        tickBaseItems(staff, p);
        rera(staff, p, "mismatch").andExpect(status().isOk());

        decide(staff, p, "{\"decision\":\"needs_info\",\"reasonCode\":\"rera_mismatch\"}")
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject(
                "select body from notifications where user_id = ? and type = 'listing.needs_info'",
                String.class, owner.getId())).contains("RERA ID");
    }

    @Test
    @DisplayName("the result is audited, the item cannot be ticked by hand, and editing the ID voids the result")
    void auditedDerivedAndVoidedByEdit() throws Exception {
        User owner = user("9870000007", "owner");
        User staff = user("9870000008", "staff");
        Property p = listing(owner, "P52100012345");
        send(post("/properties/" + p.getId() + "/verification/start"), staff, "{}").andExpect(status().isOk());

        rera(staff, p, "verified").andExpect(status().isOk());
        send(patch("/properties/" + p.getId() + "/verification/checklist"), staff,
                "{\"item\":\"" + RERA_ITEM + "\",\"pass\":false}").andExpect(status().isBadRequest());

        assertThat(jdbc.queryForList("select metadata->>'result' from audit_log where action = 'property.rera.check'"
                + " and entity_id = ?", String.class, p.getId().toString())).containsExactly("verified");
        Property stored = properties.findById(p.getId()).orElseThrow();
        assertThat(stored.getReraCheckedBy()).isEqualTo(staff.getId());
        assertThat(stored.getReraCheckedAt()).isNotNull();

        stored.setReraId("P52100012345");
        assertThat(stored.isReraVerified()).isTrue();
        stored.setReraId("P52100099999");
        assertThat(stored.getReraCheck()).isNull();
        assertThat(stored.getReraCheckedAt()).isNull();
        assertThat(stored.getReraCheckedBy()).isNull();
    }

    @Test
    @DisplayName("a RERA ID added after the case opened blocks Approve until verified; clearing it lifts the block")
    void gateFollowsTheListingNotTheChecklist() throws Exception {
        User owner = user("9870000015", "owner");
        User staff = user("9870000016", "staff");
        Property added = listing(owner, null);
        tickBaseItems(staff, added);

        Property edited = properties.findById(added.getId()).orElseThrow();
        edited.setReraId("P52100012345");
        properties.saveAndFlush(edited);
        decide(staff, added, "{\"decision\":\"approve\"}").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("rera_check_pending"));
        rera(staff, added, "verified").andExpect(status().isOk())
                .andExpect(jsonPath("$.checklist.length()").value(4));
        decide(staff, added, "{\"decision\":\"approve\"}").andExpect(status().isOk());

        Property cleared = listing(owner, "P52100012346");
        tickBaseItems(staff, cleared);
        decide(staff, cleared, "{\"decision\":\"approve\"}").andExpect(status().isConflict());
        Property unquoted = properties.findById(cleared.getId()).orElseThrow();
        unquoted.setReraId(null);
        properties.saveAndFlush(unquoted);
        decide(staff, cleared, "{\"decision\":\"approve\"}").andExpect(status().isOk());
    }

    @Test
    @DisplayName("only a verifier may record the result; a moderator without the verify function is refused")
    void verifyFunctionRequired() throws Exception {
        User owner = user("9870000017", "owner");
        User moderator = user("9870000018", "staff");
        User verifier = user("9870000019", "staff");
        Property p = listing(owner, "P52100012345");
        jdbc.update("INSERT INTO back_office_permissions (user_id, permissions) VALUES (?::uuid, ?::jsonb)",
                moderator.getId().toString(), "[\"listingModeration\"]");
        jdbc.update("INSERT INTO back_office_permissions (user_id, permissions) VALUES (?::uuid, ?::jsonb)",
                verifier.getId().toString(), "[\"propertyVerification\"]");

        rera(moderator, p, "verified").andExpect(status().isForbidden());
        assertThat(properties.findById(p.getId()).orElseThrow().getReraCheck()).isNull();
        rera(verifier, p, "verified").andExpect(status().isOk());
    }

    @Test
    @DisplayName("refused on the staff member's own listing, for a bad result, and for a buyer")
    void refusals() throws Exception {
        User owner = user("9870000009", "owner");
        User staff = user("9870000010", "staff");
        User buyer = user("9870000011", "buyer");
        Property own = listing(staff, "P52100012345");
        Property theirs = listing(owner, "P52100012345");

        rera(staff, own, "verified").andExpect(status().isForbidden());
        rera(staff, theirs, "approved").andExpect(status().isBadRequest());
        rera(buyer, theirs, "verified").andExpect(status().isForbidden());
        assertThat(properties.findById(own.getId()).orElseThrow().getReraCheck()).isNull();
    }

    @Test
    @DisplayName("buyers see RERA checked only after a verified result, and never who checked")
    void buyerSeesOnlyVerified() throws Exception {
        User owner = user("9870000012", "owner");
        User staff = user("9870000013", "staff");
        User buyer = user("9870000014", "buyer");
        Property p = listing(owner, "P52100012345");
        p.setStatus(PropertyStatus.APPROVED);
        properties.saveAndFlush(p);
        String detail = "/properties/" + p.getId();

        mvc.perform(get(detail).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.reraChecked").doesNotExist());
        rera(staff, p, "not_found").andExpect(status().isOk());
        mvc.perform(get(detail).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.reraChecked").doesNotExist());
        rera(staff, p, "verified").andExpect(status().isOk());
        mvc.perform(get(detail).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.reraChecked").value(true))
                .andExpect(content().string(not(containsString(staff.getId().toString()))));
    }
}

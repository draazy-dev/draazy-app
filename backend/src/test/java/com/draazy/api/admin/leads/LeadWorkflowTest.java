package com.draazy.api.admin.leads;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.identity.user.User;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Leads CRM workflow: one lead, one staff, a paced and audited trail")
class LeadWorkflowTest extends LeadsTestBase {
    private static final String CLAIM = LEADS + "/{id}/claim";
    private static final String CONTACTS = LEADS + "/{id}/contacts";
    private static final String STAGE = LEADS + "/{id}/stage";

    private static String stage(String stage, String note, Instant followUp) {
        return "{\"stage\":\"" + stage + "\",\"note\":" + (note == null ? "null" : "\"" + note + "\"")
                + ",\"nextFollowUpAt\":" + (followUp == null ? "null" : "\"" + followUp + "\"") + "}";
    }

    private static Instant inDays(int days) {
        return Instant.now().plus(days, ChronoUnit.DAYS);
    }

    @Test
    @DisplayName("the first claim wins; the second gets a 409 naming the owner")
    void claimRace() throws Exception {
        User ravi = staff("9877200001", "Ravi");
        User sneha = staff("9877200002", "Sneha");
        UUID id = lead("9877200010", "new", null);

        post(ravi, CLAIM, "{}", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.ownerId").value(ravi.getId().toString()))
                .andExpect(jsonPath("$.mine").value(true));
        post(sneha, CLAIM, "{}", id).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-owned"))
                .andExpect(jsonPath("$.message").value("Already owned by Ravi"));

        assertThat(ownerOf(id)).isEqualTo(ravi.getId());
        assertThat(count("select count(*) from crm_lead_activities where lead_id = ? and kind = 'claim'", id))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("a staff member can hold fifty open leads, not fifty-one")
    void claimCap() throws Exception {
        User ravi = staff("9877200003", "Ravi");
        for (int i = 0; i < 50; i++) {
            lead("98772001%02d".formatted(i), "new", ravi);
        }
        lead("9877200199", "lost", ravi);
        UUID extra = lead("9877200198", "new", null);

        post(ravi, CLAIM, "{}", extra).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-cap"));
    }

    @Test
    @DisplayName("a do-not-call lead cannot be claimed")
    void claimDoNotCall() throws Exception {
        User ravi = staff("9877200004", "Ravi");
        UUID id = lead("9877200011", "do-not-call", null);

        post(ravi, CLAIM, "{}", id).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-closed"));
    }

    @Test
    @DisplayName("only the owner can log contacts, change stage or release")
    void ownerOnly() throws Exception {
        User ravi = staff("9877200005", "Ravi");
        User sneha = staff("9877200006", "Sneha");
        UUID id = lead("9877200012", "new", ravi);

        post(sneha, CONTACTS, contact("connected"), id).andExpect(status().isForbidden());
        post(sneha, STAGE, stage("lost", "n", null), id).andExpect(status().isForbidden());
        post(sneha, LEADS + "/{id}/release", "{}", id).andExpect(status().isForbidden());
        assertThat(ownerOf(id)).isEqualTo(ravi.getId());
    }

    @Test
    @DisplayName("anyone with the leads function can edit a lead's profile, interests and notes, owned or not")
    void profileIsShared() throws Exception {
        User ravi = staff("9877200035", "Ravi");
        User sneha = staff("9877200036", "Sneha");
        UUID owned = lead("9877200037", "new", ravi);
        UUID pooled = lead("9877200038", "new", null);
        String profile = "{\"name\":\"Kiran\",\"leadType\":\"seeker\",\"intent\":\"buy\","
                + "\"propertyTypes\":[\"villa\",\"flat\"],\"bhk\":[\"3\",\"2\"],\"localities\":\" Baner, Aundh \","
                + "\"budget\":9500000,\"leadSource\":\"facebook\",\"sourceDetail\":\"Pune Flats group\"}";

        put(sneha, LEADS + "/{id}/profile", profile, owned).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Kiran"))
                .andExpect(jsonPath("$.profile.leadType").value("seeker"))
                .andExpect(jsonPath("$.profile.intent").value("buy"))
                .andExpect(jsonPath("$.profile.propertyTypes", contains("flat", "villa")))
                .andExpect(jsonPath("$.profile.bhk", contains("2", "3")))
                .andExpect(jsonPath("$.profile.localities").value("Baner, Aundh"))
                .andExpect(jsonPath("$.profile.budget").value(9500000))
                .andExpect(jsonPath("$.profile.leadSource").value("facebook"))
                .andExpect(jsonPath("$.activities[0].kind").value("profile"))
                .andExpect(jsonPath("$.activities[0].actorName").value("Sneha"));
        put(sneha, LEADS + "/{id}/interests", "{\"interests\":[\"legal\"]}", owned).andExpect(status().isOk());
        post(sneha, LEADS + "/{id}/notes", "{\"body\":\"called back on her own\"}", pooled)
                .andExpect(status().isOk());
        assertThat(ownerOf(owned)).isEqualTo(ravi.getId());
        assertThat(ownerOf(pooled)).isNull();
    }

    @Test
    @DisplayName("a profile needs a known lead type and source, an intent that fits the type, and sane values")
    void profileValidated() throws Exception {
        User ravi = staff("9877200039", "Ravi");
        UUID id = lead("9877200040", "new", null);
        String ok = "\"leadType\":\"owner\",\"leadSource\":\"walk-in\"";

        put(ravi, LEADS + "/{id}/profile", "{\"leadSource\":\"walk-in\"}", id).andExpect(status().isBadRequest());
        put(ravi, LEADS + "/{id}/profile", "{\"leadType\":\"owner\"}", id).andExpect(status().isBadRequest());
        put(ravi, LEADS + "/{id}/profile", "{" + ok + ",\"intent\":\"needs-room\"}", id)
                .andExpect(status().isBadRequest());
        put(ravi, LEADS + "/{id}/profile", "{" + ok + ",\"propertyTypes\":[\"castle\"]}", id)
                .andExpect(status().isBadRequest());
        put(ravi, LEADS + "/{id}/profile", "{" + ok + ",\"budget\":-5}", id).andExpect(status().isBadRequest());
        put(ravi, LEADS + "/{id}/profile", "{\"leadType\":\"flatmate\",\"intent\":\"has-room\","
                + "\"propertyTypes\":[\"flat\"],\"leadSource\":\"instagram\"}", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.profile.propertyTypes", hasSize(0)));
        get(ravi, LEADS + "?view=pool&type=flatmate").andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')]", hasSize(1)));
        get(ravi, LEADS + "?view=pool&type=owner").andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')]", hasSize(0)));
        get(ravi, LEADS + "?view=pool&type=alien").andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a second contact inside 24 hours is refused unless the follow-up has come due")
    void cooldown() throws Exception {
        User ravi = staff("9877200007", "Ravi");
        UUID id = lead("9877200013", "new", ravi);

        post(ravi, CONTACTS, contact("no-answer"), id).andExpect(status().isOk())
                .andExpect(jsonPath("$.nextContactAfter").isNotEmpty());
        post(ravi, CONTACTS, contact("no-answer"), id).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-cooldown"));

        jdbc.update("update crm_leads set next_follow_up_at = now() - interval '1 hour' where id = ?", id);
        post(ravi, CONTACTS, contact("no-answer"), id).andExpect(status().isOk())
                .andExpect(jsonPath("$.failedAttempts").value(2));
    }

    @Test
    @DisplayName("three failed attempts mark the lead not-reachable")
    void threeFailures() throws Exception {
        User ravi = staff("9877200008", "Ravi");
        UUID id = lead("9877200014", "new", ravi);

        for (String outcome : new String[] {"no-answer", "busy"}) {
            post(ravi, CONTACTS, contact(outcome), id).andExpect(status().isOk());
            forgetLastContact(id);
        }
        post(ravi, CONTACTS, contact("switched-off"), id).andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("not-reachable"));

        post(ravi, CONTACTS, contact("no-answer"), id).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-closed"));
    }

    @Test
    @DisplayName("a connected call resets the failure count and moves a new lead to contacted")
    void connectedResets() throws Exception {
        User ravi = staff("9877200009", "Ravi");
        UUID id = lead("9877200015", "new", ravi);

        post(ravi, CONTACTS, contact("no-answer"), id).andExpect(status().isOk());
        forgetLastContact(id);
        post(ravi, CONTACTS, contact("connected"), id).andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("contacted"))
                .andExpect(jsonPath("$.failedAttempts").value(0));
    }

    @Test
    @DisplayName("a wrong number closes the lead as lost")
    void wrongNumber() throws Exception {
        User ravi = staff("9877200016", "Ravi");
        UUID id = lead("9877200017", "new", ravi);

        post(ravi, CONTACTS, contact("wrong-number"), id).andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("lost"));
    }

    @Test
    @DisplayName("contact input is validated")
    void contactValidation() throws Exception {
        User ravi = staff("9877200018", "Ravi");
        UUID id = lead("9877200019", "new", ravi);

        post(ravi, CONTACTS, "{\"channel\":\"carrier-pigeon\",\"outcome\":\"connected\"}", id)
                .andExpect(status().isBadRequest());
        post(ravi, CONTACTS, "{\"channel\":\"call\",\"outcome\":\"shrug\"}", id).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("stage changes need a note, follow-ups where promised, and never reach converted or leave do-not-call")
    void stageRules() throws Exception {
        User ravi = staff("9877200020", "Ravi");
        UUID id = lead("9877200021", "new", ravi);

        post(ravi, STAGE, stage("lost", null, null), id).andExpect(status().isBadRequest());
        post(ravi, STAGE, stage("interested", "keen", null), id).andExpect(status().isBadRequest());
        post(ravi, STAGE, stage("interested", "keen", Instant.now().minus(1, ChronoUnit.DAYS)), id)
                .andExpect(status().isBadRequest());
        post(ravi, STAGE, stage("converted", "paid", null), id).andExpect(status().isBadRequest());
        post(ravi, STAGE, stage("interested", "keen", inDays(2)), id).andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("interested"));
        post(ravi, STAGE, stage("do-not-call", "asked to stop", null), id).andExpect(status().isOk());
        post(ravi, STAGE, stage("new", "changed mind", null), id).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-closed"));
        post(ravi, CONTACTS, contact("connected"), id).andExpect(status().isConflict());
        assertThat(count("select count(*) from crm_lead_activities where lead_id = ? and kind = 'stage'", id))
                .isEqualTo(2);
    }

    @Test
    @DisplayName("interests accept only known services")
    void interests() throws Exception {
        User ravi = staff("9877200022", "Ravi");
        UUID id = lead("9877200023", "new", ravi);

        put(ravi, LEADS + "/{id}/interests", "{\"interests\":[\"astrology\"]}", id)
                .andExpect(status().isBadRequest());
        put(ravi, LEADS + "/{id}/interests", "{\"interests\":[\"packers\",\"legal\",\"packers\"]}", id)
                .andExpect(status().isOk()).andExpect(jsonPath("$.interests", contains("legal", "packers")));
    }

    @Test
    @DisplayName("notes are logged newest first on the detail")
    void notes() throws Exception {
        User ravi = staff("9877200024", "Ravi");
        UUID id = lead("9877200025", "new", ravi);

        post(ravi, LEADS + "/{id}/notes", "{\"body\":\"first\"}", id).andExpect(status().isOk());
        post(ravi, LEADS + "/{id}/notes", "{\"body\":\"second\"}", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.activities[0].body").value("second"))
                .andExpect(jsonPath("$.activities[0].actorName").value("Ravi"));
    }

    @Test
    @DisplayName("the owner or a manager can release; a manager can reassign to an active staff member")
    void releaseAndAssign() throws Exception {
        User ravi = staff("9877200026", "Ravi");
        User sneha = staff("9877200027", "Sneha");
        User boss = manager("9877200028", "Boss");
        UUID id = lead("9877200029", "contacted", ravi);

        post(ravi, LEADS + "/{id}/release", "{}", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.ownerId").doesNotExist());
        assertThat(ownerOf(id)).isNull();

        post(sneha, LEADS + "/{id}/assign", "{\"staffId\":\"" + sneha.getId() + "\"}", id)
                .andExpect(status().isForbidden());
        post(boss, LEADS + "/{id}/assign", "{\"staffId\":\"" + sneha.getId() + "\"}", id)
                .andExpect(status().isOk()).andExpect(jsonPath("$.ownerName").value("Sneha"));
        post(boss, LEADS + "/{id}/release", "{}", id).andExpect(status().isOk());
        post(boss, LEADS + "/{id}/assign", "{\"staffId\":\"" + UUID.randomUUID() + "\"}", id)
                .andExpect(status().isBadRequest());
        assertThat(count("select count(*) from crm_lead_activities where lead_id = ? and kind in ('assign','release')",
                id)).isEqualTo(3);
    }

    @Test
    @DisplayName("a manual add needs a profile, creates once, fills blanks on a re-add, and does not claim it")
    void manualAdd() throws Exception {
        User ravi = staff("9877200030", "Ravi");
        String body = "{\"mobile\":\"+91 98772 00031\",\"profile\":{\"name\":\"Walk In\",\"leadType\":\"owner\","
                + "\"intent\":\"rent-out\",\"propertyTypes\":[\"flat\"],\"bhk\":[\"2\"],\"leadSource\":\"walk-in\","
                + "\"sourceDetail\":\"Baner office\"},\"interests\":[\"legal\"],\"note\":\"met\"}";

        post(ravi, LEADS, body).andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Walk In"))
                .andExpect(jsonPath("$.ownerId").doesNotExist())
                .andExpect(jsonPath("$.profile.leadType").value("owner"))
                .andExpect(jsonPath("$.profile.leadSource").value("walk-in"))
                .andExpect(jsonPath("$.profile.sourceDetail").value("Baner office"))
                .andExpect(jsonPath("$.signals[0].source").value("manual"));
        post(ravi, LEADS, "{\"mobile\":\"9877200031\",\"profile\":{\"leadType\":\"seeker\",\"intent\":\"buy\","
                + "\"budget\":7000000,\"leadSource\":\"referral\"},\"interests\":[\"packers\"]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.interests", contains("legal", "packers")))
                .andExpect(jsonPath("$.profile.leadType").value("owner"))
                .andExpect(jsonPath("$.profile.intent").value("rent-out"))
                .andExpect(jsonPath("$.profile.budget").value(7000000))
                .andExpect(jsonPath("$.profile.leadSource").value("walk-in"));
        post(ravi, LEADS, "{\"mobile\":\"12345\",\"profile\":{\"leadType\":\"owner\",\"leadSource\":\"other\"}}")
                .andExpect(status().isBadRequest());
        post(ravi, LEADS, "{\"mobile\":\"9877200032\"}").andExpect(status().isBadRequest());
        post(ravi, LEADS, "{\"mobile\":\"9877200032\",\"profile\":{\"leadType\":\"owner\",\"leadSource\":\"other\"},"
                + "\"interests\":[\"nope\"]}").andExpect(status().isBadRequest());

        assertThat(count("select count(*) from crm_leads where mobile = '9877200031'")).isEqualTo(1);
        assertThat(count("select count(*) from crm_leads where mobile = '9877200032'")).isZero();
    }

    @Test
    @DisplayName("search needs three characters")
    void searchNeedsThree() throws Exception {
        User ravi = staff("9877200033", "Ravi");
        lead("9877200034", "Priyanka Rao", "new", null);

        get(ravi, LEADS + "?view=search&q=pr").andExpect(status().isBadRequest());
        get(ravi, LEADS + "?view=search").andExpect(status().isBadRequest());
        get(ravi, LEADS + "?view=search&q=priy").andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].name").value("Priyanka Rao"));
        get(ravi, LEADS + "?view=search&q=77200034").andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].name").value("Priyanka Rao"))
                .andExpect(jsonPath("$.content[0].maskedMobile", containsString("XXXXX")));
    }
}

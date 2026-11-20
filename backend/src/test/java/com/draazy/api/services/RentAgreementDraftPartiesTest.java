package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Each executing party approves the rent agreement draft on their own")
class RentAgreementDraftPartiesTest extends RentAgreementCoFillFixtures {

    private static final String MINE = "$.draftApproval.parties[?(@.mine == true)]";

    @Test
    @DisplayName("the joined tenant approves before the owner; each sees only their own approval as theirs")
    void tenantThenOwnerApprove() throws Exception {
        User owner = customer("9820008301");
        User tenant = customer("9820008302");
        User desk = staff("9820008303", Teams.RENTAL);
        String id = paidInvite(owner, tenant);
        accept(tenant);
        partyDetails(tenant, id, "{\"_state\":{\"tenants\":[" + tenantJson(tenant, "Ria Sharma") + "]}}", 200);
        identities(tenant, id, "{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ria Sharma\","
                + "\"pan\":\"FGHIJ5678K\"}", 204);
        upload(tenant, id, "tenant-0-passport");
        setStatus(desk, id, "assigned", 200);
        shareDraft(desk, id, 200);
        em.flush();
        for (User party : new User[] {owner, tenant}) {
            assertThat(jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?",
                    Integer.class, party.getId(), "service.draft-shared"))
                    .as("both executing parties are told the draft is ready").isEqualTo(1);
        }

        read(tenant, id)
                .andExpect(jsonPath("$.draftApproval.total").value(2))
                .andExpect(jsonPath(MINE + ".key", Matchers.contains(Matchers.startsWith("user:"))))
                .andExpect(jsonPath(MINE + ".approved", Matchers.contains(false)));
        decide(tenant, id, "approve", 409);
        openDraft(tenant, id, 204);
        read(tenant, id).andExpect(jsonPath(MINE + ".opened", Matchers.contains(true)));
        decide(tenant, id, "approve", 200);

        read(tenant, id)
                .andExpect(jsonPath("$.status").value("draft-shared"))
                .andExpect(jsonPath(MINE + ".approved", Matchers.contains(true)));
        read(owner, id)
                .andExpect(jsonPath("$.draftApproval.approved").value(1))
                .andExpect(jsonPath(MINE + ".key", Matchers.contains(Matchers.startsWith("requester:"))))
                .andExpect(jsonPath(MINE + ".approved", Matchers.contains(false)))
                .andExpect(jsonPath(MINE + ".opened", Matchers.contains(false)));

        openDraft(owner, id, 204);
        decide(owner, id, "approve", 200);
        expectStatus(owner, id, "approved");
    }

    @Test
    @DisplayName("a party who approved can no longer request changes; the party yet to approve still can")
    void approvedPartyCannotRequestChanges() throws Exception {
        User owner = customer("9820008311");
        User tenant = customer("9820008312");
        User desk = staff("9820008313", Teams.RENTAL);
        String id = paidInvite(owner, tenant);
        accept(tenant);
        partyDetails(tenant, id, "{\"_state\":{\"tenants\":[" + tenantJson(tenant, "Ria Sharma") + "]}}", 200);
        identities(tenant, id, "{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ria Sharma\","
                + "\"pan\":\"FGHIJ5678K\"}", 204);
        upload(tenant, id, "tenant-0-passport");
        setStatus(desk, id, "assigned", 200);
        shareDraft(desk, id, 200);

        openDraft(tenant, id, 204);
        decide(tenant, id, "approve", 200);
        reject(tenant, id, "Actually change the rent", 409);
        expectStatus(tenant, id, "draft-shared");

        reject(owner, id, "Clause 7 names the wrong flat", 200);
        expectStatus(owner, id, "changes-requested");
    }
}

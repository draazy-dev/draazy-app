package com.draazy.api.services;

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
}

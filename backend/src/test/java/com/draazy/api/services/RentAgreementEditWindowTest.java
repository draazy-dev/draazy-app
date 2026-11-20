package com.draazy.api.services;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("A party can change their submitted side only until our team picks the case up")
class RentAgreementEditWindowTest extends RentAgreementCoFillFixtures {

    @Test
    @DisplayName("the invited tenant can resubmit before pickup; once staff pick up a complete case it is locked")
    void tenantLockedAfterPickup() throws Exception {
        User owner = customer("9820008201");
        User tenant = customer("9820008202");
        User desk = staff("9820008203", Teams.RENTAL);
        String id = paidInvite(owner, tenant);
        accept(tenant);
        read(tenant, id)
                .andExpect(jsonPath("$.editableByMe").value(true))
                .andExpect(jsonPath("$.mySideSubmitted").value(false))
                .andExpect(jsonPath("$.myPartyId").value(org.hamcrest.Matchers.matchesPattern("[0-9a-f-]{36}")));

        partyDetails(tenant, id, tenantState(tenant, "Ria Sharma"), 200);
        tenantPan(tenant, id, 204);
        upload(tenant, id, "tenant-0-passport");
        read(tenant, id)
                .andExpect(jsonPath("$.editableByMe").value(true))
                .andExpect(jsonPath("$.mySideSubmitted").value(true));
        partyDetails(tenant, id, tenantState(tenant, "Ria S Sharma"), 200);

        setStatus(desk, id, "assigned", 200);
        read(tenant, id)
                .andExpect(jsonPath("$.editableByMe").value(false))
                .andExpect(jsonPath("$.mySideSubmitted").value(true));
        partyDetails(tenant, id, tenantState(tenant, "Ria Sharma"), 409)
                .andExpect(jsonPath("$.message", containsString("Message our team")));
        tenantPan(tenant, id, 409);
    }

    @Test
    @DisplayName("the owner can correct their own side after paying, until pickup; priced terms and the tenant's side stay put")
    void ownerEditsUntilPickup() throws Exception {
        User owner = customer("9820008211");
        User tenant = customer("9820008212");
        User desk = staff("9820008213", Teams.RENTAL);
        String id = paidInvite(owner, tenant);
        accept(tenant);
        partyDetails(tenant, id, tenantState(tenant, "Ria Sharma"), 200);
        read(owner, id)
                .andExpect(jsonPath("$.editableByMe").value(true))
                .andExpect(jsonPath("$.mySideSubmitted").value(true))
                .andExpect(jsonPath("$.myPartyId").doesNotExist());

        ownerDetails(tenant, id, ownerState(owner, "Koregaon Park, Pune"), 403);
        ownerDetails(owner, id, "{\"_state\":{\"owner\":" + ownerJson(owner, "Koregaon Park, Pune")
                + ",\"tenants\":[" + tenantJson(tenant, "Someone Else") + "]}}", 200)
                .andExpect(jsonPath("$.details._state.owner.oAddr").value("Koregaon Park, Pune"))
                .andExpect(jsonPath("$.details._state.tenants[0].name").value("Ria Sharma"));
        ownerDetails(owner, id, "{\"_state\":{\"terms\":{\"rent\":\"35000\",\"deposit\":\"0\",\"months\":\"11\","
                + "\"startDate\":\"" + START_DATE + "\"}}}", 409)
                .andExpect(jsonPath("$.message", containsString("rent")));
        ownerPan(owner, id, 204);

        setStatus(desk, id, "assigned", 200);
        read(owner, id).andExpect(jsonPath("$.editableByMe").value(false));
        ownerDetails(owner, id, ownerState(owner, "Aundh, Pune"), 409)
                .andExpect(jsonPath("$.message", containsString("Message our team")));
        ownerPan(owner, id, 409);
    }

    @Test
    @DisplayName("before payment the requester edits their details on the edit route")
    void ownerEditsBeforePayment() throws Exception {
        User owner = customer("9820008221");
        User tenant = customer("9820008222");
        String id = invite(owner, tenant, "invite");
        read(owner, id)
                .andExpect(jsonPath("$.editableByMe").value(true))
                .andExpect(jsonPath("$.mySideSubmitted").value(false));

        ownerDetails(owner, id, ownerState(owner, "Koregaon Park, Pune"), 200);
    }

    private static String tenantState(User tenant, String name) {
        return "{\"_state\":{\"tenants\":[" + tenantJson(tenant, name) + "]}}";
    }

    private static String ownerState(User owner, String address) {
        return "{\"_state\":{\"owner\":" + ownerJson(owner, address) + "}}";
    }

    private void tenantPan(User tenant, String id, int expected) throws Exception {
        identities(tenant, id, "{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ria Sharma\","
                + "\"pan\":\"FGHIJ5678K\"}", expected);
    }

    private ResultActions ownerDetails(User caller, String id, String details, int expected) throws Exception {
        return mvc.perform(put(Routes.ServiceRequests.DETAILS, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"details\":" + details + "}"))
                .andExpect(status().is(expected));
    }
}

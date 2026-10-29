package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("Rent agreement corrections — the desk sends a case back, or fixes the form itself")
class RentAgreementCorrectionsTest extends ServiceFixtures {

    private static final String TERMS = "{\"type\":\"rent-agreement\",\"details\":{\"rent\":20000,"
            + "\"deposit\":60000,\"months\":11,\"_state\":{\"prop\":{\"gramPanchayat\":false},\"terms\":{\"rent\":\"20000\",\"deposit\":\"60000\","
            + "\"months\":\"11\"}}}}";
    private static final String ASK = "{\"party\":\"owner\",\"reason\":\"The flat number does not match the index II\","
            + "\"papers\":[\"ownership-proof\"]}";

    @Autowired
    EntityManager em;

    private String raisedAndAssigned(User owner, User desk) throws Exception {
        String json = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON).content(TERMS))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = field(json, "id");
        serviceRequests.applyWebhookOutcome(paymentRef(id), true, null, null);
        setStatus(desk, id, "assigned", 200);
        return id;
    }

    private ResultActions send(User caller, MockHttpServletRequestBuilder req,
            String body) throws Exception {
        return mvc.perform(req.header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private int notices(User user, String type) {
        em.flush();
        return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?",
                Integer.class, user.getId(), type);
    }

    private static String edit(String prop, String rent) {
        return "{\"state\":{\"prop\":{\"gramPanchayat\":false" + prop + "},\"terms\":{\"rent\":\"" + rent
                + "\",\"deposit\":\"60000\",\"months\":\"11\"}},\"note\":\"Fixed the flat number\"}";
    }

    @Test
    @DisplayName("the holder sends it back to the owner, who is told, and their done returns it to the desk")
    void attentionRoundTrip() throws Exception {
        User owner = customer("9820009001");
        User desk = staff("9820009002", Teams.RENTAL);
        User stranger = customer("9820009003");
        String id = raisedAndAssigned(owner, desk);

        send(owner, post(Routes.ServiceRequests.ATTENTION, id), ASK).andExpect(status().isForbidden());
        send(desk, post(Routes.ServiceRequests.ATTENTION, id), ASK)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("action-required"))
                .andExpect(jsonPath("$.attention.party").value("owner"))
                .andExpect(jsonPath("$.attention.papers[0].id").value("ownership-proof"))
                .andExpect(jsonPath("$.attention.forYou").value(false));
        assertThat(notices(owner, "service.action-required")).isEqualTo(1);
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.attention.forYou").value(true))
                .andExpect(jsonPath("$.attention.reason").value("The flat number does not match the index II"));

        send(stranger, post(Routes.ServiceRequests.ATTENTION_RESOLVE, id), "{}").andExpect(status().isNotFound());
        User tenant = customer("9820009004");
        jdbc.update("insert into service_request_parties (request_id, user_id, role, status, invited_by)"
                + " values (?::uuid, ?, 'tenant', 'accepted', ?)", id, tenant.getId(), owner.getId());
        send(tenant, post(Routes.ServiceRequests.ATTENTION_RESOLVE, id), "{}").andExpect(status().isConflict());
        send(owner, post(Routes.ServiceRequests.ATTENTION_RESOLVE, id), "{}").andExpect(status().isConflict());
        upload(owner, id, "ownership-proof");
        send(owner, post(Routes.ServiceRequests.ATTENTION_RESOLVE, id), "{\"note\":\"Corrected to B-1204\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("in-progress"))
                .andExpect(jsonPath("$.attention").doesNotExist());
        assertThat(notices(desk, "service.attention-resolved")).isEqualTo(1);
        send(owner, post(Routes.ServiceRequests.ATTENTION_RESOLVE, id), "{}").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("only the holder sends it back, and only to the owner or the tenant")
    void attentionIsTheHoldersCall() throws Exception {
        User owner = customer("9820009011");
        User desk = staff("9820009012", Teams.RENTAL);
        User other = staff("9820009013", Teams.RENTAL);
        String id = raisedAndAssigned(owner, desk);
        nriParties(id);

        send(other, post(Routes.ServiceRequests.ATTENTION, id), ASK).andExpect(status().isConflict());
        send(desk, post(Routes.ServiceRequests.ATTENTION, id),
                "{\"party\":\"broker\",\"reason\":\"Fix it\"}").andExpect(status().isUnprocessableEntity());
        send(desk, post(Routes.ServiceRequests.ATTENTION, id),
                "{\"party\":\"owner\",\"papers\":[\"tenant-0-passport\"]}").andExpect(status().isUnprocessableEntity());
        send(desk, post(Routes.ServiceRequests.ATTENTION, id), "{\"party\":\"owner\"}")
                .andExpect(status().isUnprocessableEntity());
        send(desk, post(Routes.ServiceRequests.ATTENTION, id), "{\"party\":\"owner\",\"papers\":[\"licensor-0-passport\"]}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.attention.papers[0].name").value("Licensor 1 \u2014 Passport scan"));
    }

    @Test
    @DisplayName("the holder corrects the form; the summary follows and the customer is told, but price stays put")
    void deskEditsTheForm() throws Exception {
        User owner = customer("9820009021");
        User desk = staff("9820009022", Teams.RENTAL);
        User other = staff("9820009023", Teams.RENTAL);
        String id = raisedAndAssigned(owner, desk);
        String fixed = edit(",\"flatNo\":\"B-1204\",\"society\":\"Green Acres\"", "20000");

        send(owner, put(Routes.ServiceRequests.DESK_DETAILS, id), fixed).andExpect(status().isForbidden());
        send(other, put(Routes.ServiceRequests.DESK_DETAILS, id), fixed).andExpect(status().isConflict());
        send(desk, put(Routes.ServiceRequests.DESK_DETAILS, id), fixed)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.details._state.prop.flatNo").value("B-1204"))
                .andExpect(jsonPath("$.details.property").value("B-1204, Green Acres"))
                .andExpect(jsonPath("$.details.rent").value(20000));
        assertThat(notices(owner, "service.details-edited")).isEqualTo(1);

        send(desk, put(Routes.ServiceRequests.DESK_DETAILS, id), fixed).andExpect(status().isUnprocessableEntity());
        send(desk, put(Routes.ServiceRequests.DESK_DETAILS, id),
                edit(",\"flatNo\":\"B-1204\",\"society\":\"Green Acres\"", "25000"))
                .andExpect(status().isConflict());
        send(desk, put(Routes.ServiceRequests.DESK_DETAILS, id),
                "{\"state\":{\"prop\":{\"gramPanchayat\":false,\"flatNo\":\"B-1204\",\"society\":\"Green Acres\"},"
                        + "\"owner\":{\"oPan\":\"ABCDE1234F\"},\"terms\":{\"rent\":\"20000\",\"deposit\":\"60000\","
                        + "\"months\":\"11\"}}}")
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("select details::text from service_requests where id = ?::uuid", String.class, id))
                .doesNotContain("ABCDE1234F");
    }

    @Test
    @DisplayName("a desk rename keeps that party's numbers under the new name, so the customer's top-up still keeps them")
    void deskRenameRelabelsTheNumbers() throws Exception {
        User owner = customer("9820009041");
        User desk = staff("9820009042", Teams.RENTAL);
        String id = raisedAndAssigned(owner, desk);
        em.flush();
        jdbc.update("update service_requests set details = jsonb_set(details, '{_state,tenants}', '[{\"name\":\"Ravi Kale\"}]')"
                + " where id = ?::uuid", id);
        em.clear();
        send(owner, put(Routes.ServiceRequests.IDENTITIES, id), "{\"parties\":[{\"partyRole\":\"tenant\",\"partyIndex\":0,"
                + "\"partyName\":\"Ravi Kale\",\"pan\":\"ABCDE1234F\"}]}").andExpect(status().isNoContent());

        send(desk, put(Routes.ServiceRequests.DESK_DETAILS, id), "{\"state\":{\"prop\":{\"gramPanchayat\":false},"
                + "\"tenants\":[{\"name\":\"Ravi S. Kale\"}],\"terms\":{\"rent\":\"20000\",\"deposit\":\"60000\",\"months\":\"11\"}}}")
                .andExpect(status().isOk());
        mvc.perform(get(Routes.ServiceRequests.IDENTITIES, id).header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(jsonPath("$[?(@.partyRole=='tenant')].partyName").value("Ravi S. Kale"))
                .andExpect(jsonPath("$[?(@.partyRole=='tenant')].pan").value("ABCDE1234F"));
    }

    @Test
    @DisplayName("the holder corrects a mistyped PAN or Aadhaar; only that party's numbers change and the audit keeps none")
    void deskCorrectsIdentities() throws Exception {
        User owner = customer("9820009031");
        User desk = staff("9820009032", Teams.RENTAL);
        User other = staff("9820009033", Teams.RENTAL);
        String id = raisedAndAssigned(owner, desk);
        send(owner, put(Routes.ServiceRequests.IDENTITIES, id), "{\"parties\":["
                + "{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ravi\",\"pan\":\"ABCDE1234X\"},"
                + "{\"partyRole\":\"witness\",\"partyIndex\":0,\"partyName\":\"Meera\",\"aadhaar\":\"444455556666\"}]}")
                .andExpect(status().isNoContent());
        String fix = "{\"parties\":[{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ravi\","
                + "\"pan\":\"ABCDE1234F\",\"aadhaar\":\"211122223335\"}]}";

        send(owner, put(Routes.ServiceRequests.DESK_IDENTITIES, id), fix).andExpect(status().isForbidden());
        send(other, put(Routes.ServiceRequests.DESK_IDENTITIES, id), fix).andExpect(status().isConflict());
        send(admin("9820009034"), put(Routes.ServiceRequests.DESK_IDENTITIES, id), fix).andExpect(status().isConflict());
        send(desk, put(Routes.ServiceRequests.DESK_IDENTITIES, id), "{\"parties\":[{\"partyRole\":\"tenant\","
                + "\"partyIndex\":3,\"partyName\":\"Ghost\",\"pan\":\"ABCDE1234F\"}]}")
                .andExpect(status().isUnprocessableEntity());
        send(desk, put(Routes.ServiceRequests.DESK_IDENTITIES, id), fix).andExpect(status().isNoContent());
        send(desk, put(Routes.ServiceRequests.DESK_IDENTITIES, id), fix).andExpect(status().isUnprocessableEntity());

        mvc.perform(get(Routes.ServiceRequests.IDENTITIES, id).header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(jsonPath("$[?(@.partyRole=='tenant')].pan").value("ABCDE1234F"))
                .andExpect(jsonPath("$[?(@.partyRole=='tenant')].aadhaar").value("211122223335"))
                .andExpect(jsonPath("$[?(@.partyRole=='witness')].aadhaar").value("444455556666"));
        assertThat(notices(owner, "service.details-edited")).isEqualTo(1);
        em.flush();
        assertThat(jdbc.queryForList("select coalesce(metadata::text, '') from audit_log where action = ? and entity_id = ?",
                String.class, "service-request.identities-corrected", id)).singleElement().asString()
                .contains("tenant-0").doesNotContain("ABCDE1234F", "211122223335", "witness-0");
    }
}

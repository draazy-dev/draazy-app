package com.draazy.api.services;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

abstract class RentAgreementCoFillFixtures extends ServiceFixtures {

    static final String PROP = "\"prop\":{\"gramPanchayat\":false,\"propType\":\"Flat / Apartment\","
            + "\"flatNo\":\"B-1204\",\"society\":\"Skyline Heights\",\"locality\":\"Baner\",\"pincode\":\"411045\","
            + "\"area\":\"850\"," + IGR_PROP_FIELDS + "}";
    static final String START_DATE = LocalDate.now(PlatformTime.IST).plusDays(7).toString();
    static final String TERMS = "\"terms\":{\"rent\":\"30000\",\"deposit\":\"0\",\"months\":\"11\","
            + "\"startDate\":\"" + START_DATE + "\"}";
    static final String DECLARATION = "{\"declaration\":\"ra-decl-2026-10\"}";

    String invite(User owner, User tenant, String tenantMode) throws Exception {
        String created = mvc.perform(post(Routes.ServiceRequests.CO_FILL_CREATE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"request\":{\"type\":\"rent-agreement\",\"details\":{\"_state\":"
                                + "{\"owner\":" + ownerJson(owner, "MG Road, Pune") + ","
                                + "\"tenantMode\":\"" + tenantMode + "\"," + PROP + "," + TERMS
                                + "}}},\"role\":\"tenant\",\"mobile\":\"" + tenant.getMobile() + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(created, "id");
    }

    static String ownerJson(User owner, String address) {
        return "{\"oName\":\"Asha Patil\",\"oAge\":\"52\",\"oAddr\":\"" + address + "\","
                + "\"oMobile\":\"" + owner.getMobile() + "\",\"capacity\":\"owner\"}";
    }

    static String tenantJson(User tenant, String name) {
        return "{\"name\":\"" + name + "\",\"age\":\"29\",\"addr\":\"FC Road, Pune\",\"mobile\":\""
                + tenant.getMobile() + "\",\"residency\":\"nri\",\"passport\":\"Z1234567\"}";
    }

    String ownerPan(User owner, String id, int expected) throws Exception {
        identities(owner, id, "{\"partyRole\":\"owner\",\"partyIndex\":0,\"partyName\":\"Asha Patil\","
                + "\"pan\":\"ABCDE1234F\"}", expected);
        return id;
    }

    String paidInvite(User owner, User tenant) throws Exception {
        String id = invite(owner, tenant, "invite");
        upload(owner, id, "ownership-proof");
        ownerPan(owner, id, 204);
        checkout(owner, id, 200);
        pay(id);
        return id;
    }

    void accept(User tenant) throws Exception {
        String invites = mvc.perform(get(Routes.ServiceRequests.MY_INVITES)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        mvc.perform(post(Routes.ServiceRequests.INVITE_DECISION, field(invites, "id"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"accept\"}"))
                .andExpect(status().isOk());
    }

    void pay(String id) {
        em.flush();
        em.clear();
        String ref = requestRepo.findById(UUID.fromString(id)).orElseThrow().getPaymentRef();
        serviceRequests.applyWebhookOutcome(ref, true, null, null);
    }

    ResultActions read(User caller, String id) throws Exception {
        return mvc.perform(get(Routes.ServiceRequests.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isOk());
    }

    ResultActions partyDetails(User caller, String id, String details, int expected) throws Exception {
        return mvc.perform(put(Routes.ServiceRequests.PARTY_DETAILS, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"details\":" + details + "}"))
                .andExpect(status().is(expected));
    }

    void identities(User caller, String id, String party, int expected) throws Exception {
        mvc.perform(put(Routes.ServiceRequests.IDENTITIES, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"parties\":[" + party + "]}"))
                .andExpect(status().is(expected));
    }

    ResultActions checkout(User caller, String id, int expected) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.CHECKOUT, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(DECLARATION))
                .andExpect(status().is(expected));
    }
}

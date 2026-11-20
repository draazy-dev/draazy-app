package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Rent agreement: an invited owner takes over a tenant-started agreement and pays")
class RentAgreementOwnerTakeoverTest extends ServiceFixtures {

    private static final List<String> PAPERS = List.of("pan", "aadhaar", "photo");
    private static final String OWNER_ROW = "{\"partyRole\":\"owner\",\"partyIndex\":0,\"partyName\":\"Asha Patil\","
            + "\"aadhaar\":\"211122223335\",\"pan\":\"ABCDE1234F\"}";
    private static final String TENANT_ROW = "{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ria Sharma\","
            + "\"aadhaar\":\"444455556666\",\"pan\":\"FGHIJ5678K\"}";
    private static final String TENANT_FIXED = "{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ria Sharma\","
            + "\"pan\":\"FGHIJ5679K\"}";

    @Test
    @DisplayName("the tenant cannot pay; once the owner accepts, the owner holds the request and the tenant is a party")
    void ownerAcceptingTakesOver() throws Exception {
        User tenant = customer("9820000870");
        User owner = customer("9820000871");
        String id = tenantStarted(tenant, owner, "30000");
        checkout(tenant, id).andExpect(status().isForbidden());

        decide(owner, field(invite(tenant, id, owner), "id")).andExpect(status().isOk());

        assertThat(requestRepo.findById(UUID.fromString(id)).orElseThrow().getRequesterId()).isEqualTo(owner.getId());
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.myPartyId").isNotEmpty())
                .andExpect(jsonPath("$.cancellable").value(false));
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.myPartyId").doesNotExist())
                .andExpect(jsonPath("$.cancellable").value(true));
        checkout(tenant, id).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("the owner edits the whole form, replaces the tenant's papers and PAN, reprices and pays")
    void ownerEditsEverythingAndPays() throws Exception {
        User tenant = customer("9820000872");
        User owner = customer("9820000873");
        String id = tenantStarted(tenant, owner, "30000");
        for (String paper : PAPERS) {
            upload(tenant, id, "tenant-0-" + paper, 201);
        }
        identities(tenant, id, rows(TENANT_ROW)).andExpect(status().isNoContent());
        decide(owner, field(invite(tenant, id, owner), "id")).andExpect(status().isOk());
        long before = requestRepo.findById(UUID.fromString(id)).orElseThrow().getAmount();

        details(owner, id, state(owner.getMobile(), tenant.getMobile(), "45000", "fill"))
                .andExpect(status().isOk());
        assertThat(requestRepo.findById(UUID.fromString(id)).orElseThrow().getAmount()).isGreaterThan(before);
        upload(owner, id, "tenant-0-pan", 201);
        identities(owner, id, rows(OWNER_ROW, TENANT_FIXED)).andExpect(status().isNoContent());
        for (String paper : PAPERS) {
            upload(owner, id, "licensor-0-" + paper, 201);
        }
        upload(owner, id, "ownership-proof", 201);

        checkout(owner, id).andExpect(status().isOk()).andExpect(jsonPath("$.paymentSessionId").isNotEmpty());
        details(owner, id, state(owner.getMobile(), tenant.getMobile(), "50000", "fill"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("an owner with two flats can hold one unpaid agreement on each, but not two on the same flat")
    void oneUnpaidAgreementPerFlat() throws Exception {
        User tenant = customer("9820000874");
        User otherTenant = customer("9820000876");
        User owner = customer("9820000875");
        raiseUnpaid(owner, listing(owner));
        String id = tenantStarted(tenant, owner, "30000");
        decide(owner, field(invite(tenant, id, owner), "id")).andExpect(status().isOk());
        assertThat(requestRepo.findById(UUID.fromString(id)).orElseThrow().getRequesterId()).isEqualTo(owner.getId());

        String sameFlat = tenantStarted(otherTenant, owner, "32000");
        decide(owner, field(invite(otherTenant, sameFlat, owner), "id"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("for this flat")));
        assertThat(requestRepo.findById(UUID.fromString(sameFlat)).orElseThrow().getRequesterId())
                .isEqualTo(otherTenant.getId());
    }

    @Test
    @DisplayName("once the form is complete the tenant may pay; the owner is told who paid")
    void tenantPaysAfterTakeover() throws Exception {
        User tenant = customer("9820000877");
        User owner = customer("9820000878");
        String id = readyAfterTakeover(tenant, owner);
        view(tenant, id).andExpect(jsonPath("$.payableByMe").value(true));
        view(owner, id).andExpect(jsonPath("$.payableByMe").value(false));

        checkout(tenant, id).andExpect(status().isOk()).andExpect(jsonPath("$.paymentSessionId").isNotEmpty());
        simulate(owner, id).andExpect(status().isForbidden());
        simulate(tenant, id).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("new"));

        assertThat(requestRepo.findById(UUID.fromString(id)).orElseThrow().getPayerId()).isEqualTo(tenant.getId());
        view(owner, id).andExpect(jsonPath("$.paidBy").value(tenant.getName()));
        view(tenant, id).andExpect(jsonPath("$.paidBy").doesNotExist());
        checkout(owner, id).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("whoever opens checkout last replaces the other side's unpaid order, and only they can settle it")
    void laterCheckoutReplacesTheOpenOrder() throws Exception {
        User tenant = customer("9820000879");
        User owner = customer("9820000880");
        String id = readyAfterTakeover(tenant, owner);

        checkout(tenant, id).andExpect(status().isOk());
        String tenantOrder = requestRepo.findById(UUID.fromString(id)).orElseThrow().getPaymentRef();
        checkout(owner, id).andExpect(status().isOk());

        var row = requestRepo.findById(UUID.fromString(id)).orElseThrow();
        assertThat(row.getPaymentRef()).isNotEqualTo(tenantOrder);
        assertThat(row.getPayerId()).isEqualTo(owner.getId());
        simulate(tenant, id).andExpect(status().isForbidden());
        simulate(owner, id).andExpect(status().isOk());
        assertThat(requestRepo.findById(UUID.fromString(id)).orElseThrow().getPayerId()).isEqualTo(owner.getId());
    }

    @Test
    @DisplayName("a stranger cannot open checkout on someone else's agreement")
    void strangerCannotCheckout() throws Exception {
        User tenant = customer("9820000881");
        User owner = customer("9820000882");
        User stranger = customer("9820000883");
        String id = readyAfterTakeover(tenant, owner);

        checkout(stranger, id).andExpect(status().isNotFound());
        view(stranger, id).andExpect(status().isNotFound());
    }

    private String readyAfterTakeover(User tenant, User owner) throws Exception {
        String id = tenantStarted(tenant, owner, "30000");
        for (String paper : PAPERS) {
            upload(tenant, id, "tenant-0-" + paper, 201);
        }
        identities(tenant, id, rows(TENANT_ROW)).andExpect(status().isNoContent());
        decide(owner, field(invite(tenant, id, owner), "id")).andExpect(status().isOk());
        identities(owner, id, rows(OWNER_ROW, TENANT_ROW)).andExpect(status().isNoContent());
        for (String paper : PAPERS) {
            upload(owner, id, "licensor-0-" + paper, 201);
        }
        upload(owner, id, "ownership-proof", 201);
        return id;
    }

    private ResultActions view(User caller, String id) throws Exception {
        return mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private ResultActions simulate(User caller, String id) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.PAYMENT_SIMULATE, id).param("outcome", "paid")
                .header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private String tenantStarted(User tenant, User owner, String rent) throws Exception {
        String body = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"rent-agreement\",\"details\":{\"_state\":"
                                + state(owner.getMobile(), tenant.getMobile(), rent, "invite") + "}}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(body, "id");
    }

    private static String state(String ownerMobile, String tenantMobile, String rent, String ownerMode) {
        String start = LocalDate.now(com.draazy.api.common.PlatformTime.IST).plusDays(7).toString();
        return "{\"ownerMode\":\"" + ownerMode + "\",\"tenantMode\":\"fill\","
                + "\"owner\":{\"oName\":\"Asha Patil\",\"oAge\":\"52\",\"oAddr\":\"MG Road, Pune\",\"oMobile\":\""
                + ownerMobile + "\",\"capacity\":\"owner\"},"
                + "\"tenants\":[{\"name\":\"Ria Sharma\",\"age\":\"29\",\"addr\":\"FC Road, Pune\",\"mobile\":\""
                + tenantMobile + "\"}],"
                + "\"prop\":{\"gramPanchayat\":false,\"propType\":\"Flat / Apartment\",\"flatNo\":\"B-1204\","
                + "\"society\":\"Skyline Heights\",\"locality\":\"Baner\",\"pincode\":\"411045\",\"area\":\"850\","
                + IGR_PROP_FIELDS + "},"
                + "\"terms\":{\"months\":\"11\",\"rent\":\"" + rent + "\",\"deposit\":\"0\",\"lockin\":\"3\","
                + "\"notice\":\"1\",\"dueDay\":\"5\",\"increment\":\"5\",\"startDate\":\"" + start + "\"}}";
    }

    private String invite(User requester, String id, User owner) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.PARTIES, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requester))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"owner\",\"partyIndex\":0,\"mobile\":\"" + owner.getMobile() + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private ResultActions decide(User invitee, String partyId) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.INVITE_DECISION, partyId)
                .header(HttpHeaders.AUTHORIZATION, bearer(invitee))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"accept\"}"));
    }

    private ResultActions details(User caller, String id, String stateJson) throws Exception {
        return mvc.perform(put(Routes.ServiceRequests.DETAILS, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"details\":{\"_state\":" + stateJson + "}}"));
    }

    private ResultActions identities(User caller, String id, String body) throws Exception {
        return mvc.perform(put(Routes.ServiceRequests.IDENTITIES, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions checkout(User caller, String id) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.CHECKOUT, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"declaration\":\"ra-decl-2026-10\"}"));
    }

    private static String rows(String... rows) {
        return "{\"parties\":[" + String.join(",", rows) + "]}";
    }
}

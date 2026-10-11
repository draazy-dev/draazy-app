package com.draazy.api.services;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Rent agreement: only the owner files owner-side papers and identities")
class RentAgreementOwnerSideTest extends ServiceFixtures {

    private static final String OWNER_ERROR = "owner_side_requires_owner";
    private static final String PENDING_ERROR = "owner_side_pending";
    private static final List<String> PAPERS = List.of("pan", "aadhaar", "photo");
    private static final String PROP = "\"prop\":{\"gramPanchayat\":false,\"propType\":\"Flat / Apartment\","
            + "\"flatNo\":\"B-1204\",\"society\":\"Skyline Heights\",\"locality\":\"Baner\",\"pincode\":\"411045\","
            + "\"area\":\"850\"}";
    private static final String WITNESSES = "\"wit\":{\"w1Name\":\"Suresh Patil\",\"w1Age\":\"41\","
            + "\"w1Addr\":\"Karve Road, Pune\",\"w2Name\":\"Meera Joshi\",\"w2Age\":\"36\",\"w2Addr\":\"JM Road, Pune\"}";
    private static final String OWNER_ROW = "{\"partyRole\":\"owner\",\"partyIndex\":0,\"partyName\":\"Asha\","
            + "\"aadhaar\":\"211122223335\",\"pan\":\"ABCDE1234F\"}";
    private static final String TENANT_ROW = "{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ria\","
            + "\"aadhaar\":\"444455556666\",\"pan\":\"FGHIJ5678K\"}";
    private static final String WITNESS_ROWS = "{\"partyRole\":\"witness\",\"partyIndex\":0,\"partyName\":\"Suresh\","
            + "\"aadhaar\":\"666677778888\"},{\"partyRole\":\"witness\",\"partyIndex\":1,\"partyName\":\"Meera\","
            + "\"aadhaar\":\"234567890124\"}";

    @Test
    @DisplayName("a tenant who raised the request cannot file the owner's papers, from upload or from the vault")
    void tenantRequesterCannotFileOwnerPapers() throws Exception {
        User lister = customer("9820000850");
        User tenant = customer("9820000851");
        String id = raiseUnpaid(tenant, listing(lister));

        for (String category : List.of("licensor-0-pan", "LICENSOR-0-PAN", "licensor-1-aadhaar", "ownership-proof")) {
            refused(upload403(tenant, id, category));
            refused(fromVault(tenant, id, vaultPaper(tenant), category));
        }
        upload(tenant, id, "tenant-0-pan", 201);
    }

    @Test
    @DisplayName("a tenant who raised the request cannot write owner identities, and tenant rows still save")
    void tenantRequesterCannotWriteOwnerIdentities() throws Exception {
        User lister = customer("9820000852");
        User tenant = customer("9820000853");
        String id = raiseUnpaid(tenant, listing(lister));

        refused(identities(tenant, id, rows(OWNER_ROW)));
        refused(identities(tenant, id, rows(TENANT_ROW, OWNER_ROW)));
        identities(tenant, id, rows(TENANT_ROW, WITNESS_ROWS)).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("a requester who does not own the listing is a tenant even when they typed their own number as the owner's")
    void listingOwnerDecidesOverTypedMobile() throws Exception {
        User lister = customer("9820000854");
        User tenant = customer("9820000855");
        Property property = listing(lister);
        String id = create(tenant, property, "{\"owner\":{\"oMobile\":\"" + tenant.getMobile() + "\"}}");

        refused(upload403(tenant, id, "licensor-0-pan"));
        refused(identities(tenant, id, rows(OWNER_ROW)));
    }

    @Test
    @DisplayName("the listing's owner raising the request files owner papers and identities")
    void listingOwnerRequesterMayFile() throws Exception {
        User lister = customer("9820000856");
        String id = raiseUnpaid(lister, listing(lister));

        upload(lister, id, "licensor-0-pan", 201);
        upload(lister, id, "ownership-proof", 201);
        identities(lister, id, rows(OWNER_ROW)).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("a requester named as the owner in a request with no listing files owner papers and identities")
    void ownerModeRequesterMayFile() throws Exception {
        User owner = customer("9820000857");
        String id = create(owner, null, "{\"owner\":{\"oMobile\":\"" + owner.getMobile() + "\"}}");

        upload(owner, id, "licensor-0-pan", 201);
        upload(owner, id, "ownership-proof", 201);
        fromVault(owner, id, vaultPaper(owner), "licensor-0-photo", 201);
        identities(owner, id, rows(OWNER_ROW)).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("an accepted owner party files its own papers and identity, and the tenant requester still cannot")
    void acceptedOwnerPartyMayFile() throws Exception {
        User tenant = customer("9820000858");
        User owner = customer("9820000859");
        String id = tenantFirst(tenant, owner);

        upload(owner, id, "licensor-0-pan", 201);
        upload(owner, id, "LICENSOR-0-AADHAAR", 201);
        upload(owner, id, "ownership-proof", 201);
        identities(owner, id, rows(OWNER_ROW)).andExpect(status().isNoContent());

        upload(tenant, id, "licensor-0-photo", 403);
        refused(identities(tenant, id, rows(OWNER_ROW)));
    }

    @Test
    @DisplayName("checkout waits for the owner: no owner party, then an owner who has not filed, then done")
    void checkoutWaitsForTheOwner() throws Exception {
        User tenant = customer("9820000860");
        User owner = customer("9820000861");
        String id = tenantRaised(tenant, owner);
        upload(tenant, id, "tenant-0-pan", 201);

        pending(checkout(tenant, id), "Licensor 1");

        String party = field(invite(tenant, id, owner), "id");
        pending(checkout(tenant, id), "Licensor 1");
        decide(owner, party);
        pending(checkout(tenant, id), "Licensor 1");

        for (String paper : PAPERS) {
            upload(tenant, id, "tenant-0-" + paper, 201);
        }
        identities(tenant, id, rows(TENANT_ROW, WITNESS_ROWS)).andExpect(status().isNoContent());
        pending(checkout(tenant, id), "Ownership proof");

        for (String paper : PAPERS) {
            upload(owner, id, "licensor-0-" + paper, 201);
        }
        upload(owner, id, "ownership-proof", 201);
        pending(checkout(tenant, id), "Licensor 1");
        identities(owner, id, rows(OWNER_ROW)).andExpect(status().isNoContent());

        checkout(tenant, id).andExpect(status().isOk()).andExpect(jsonPath("$.paymentSessionId").isNotEmpty());
    }

    @Test
    @DisplayName("an owner-mode requester's checkout is not held for an owner party")
    void ownerModeCheckoutIsNotHeld() throws Exception {
        User owner = customer("9820000862");
        String id = create(owner, null, state(owner.getMobile(), "9820000863"));
        for (String paper : PAPERS) {
            upload(owner, id, "licensor-0-" + paper, 201);
            upload(owner, id, "tenant-0-" + paper, 201);
        }
        upload(owner, id, "ownership-proof", 201);
        identities(owner, id, rows(OWNER_ROW, TENANT_ROW, WITNESS_ROWS)).andExpect(status().isNoContent());

        checkout(owner, id).andExpect(status().isOk());
    }

    private void refused(ResultActions result) throws Exception {
        result.andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value(OWNER_ERROR));
    }

    private void pending(ResultActions result, String waitingOn) throws Exception {
        result.andExpect(status().isConflict()).andExpect(jsonPath("$.error").value(PENDING_ERROR))
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString(waitingOn)));
    }

    private ResultActions upload403(User caller, String id, String category) throws Exception {
        return mvc.perform(multipart(Routes.ServiceRequests.DOCS, id)
                .file(new MockMultipartFile("file", "scan.pdf", "application/pdf", "%PDF-1.4".getBytes()))
                .param("category", category)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private ResultActions fromVault(User caller, String id, String documentId, String category) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.DOCS_FROM_VAULT, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"documentId\":\"" + documentId + "\",\"category\":\"" + category + "\"}"));
    }

    private ResultActions fromVault(User caller, String id, String documentId, String category, int expected)
            throws Exception {
        return fromVault(caller, id, documentId, category).andExpect(status().is(expected));
    }

    private String vaultPaper(User caller) throws Exception {
        String body = mvc.perform(multipart(Routes.MeDocuments.PERSONAL)
                        .file(new MockMultipartFile("file", "pan.pdf", "application/pdf", "%PDF-1.4".getBytes()))
                        .param("category", "PAN Card")
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(body, "id");
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
                .content("{\"declaration\":\"ra-decl-2026-09\"}"));
    }

    private static String rows(String... rows) {
        return "{\"parties\":[" + String.join(",", rows) + "]}";
    }

    private static String state(String ownerMobile, String tenantMobile) {
        String start = LocalDate.now(com.draazy.api.common.PlatformTime.IST).plusDays(7).toString();
        return "{\"owner\":{\"oName\":\"Asha Patil\",\"oAge\":\"52\",\"oAddr\":\"MG Road, Pune\",\"oMobile\":\""
                + ownerMobile + "\",\"capacity\":\"owner\"},"
                + "\"tenants\":[{\"name\":\"Ria Sharma\",\"age\":\"29\",\"addr\":\"FC Road, Pune\",\"mobile\":\""
                + tenantMobile + "\"}]," + PROP + "," + WITNESSES + ","
                + "\"terms\":{\"months\":\"11\",\"rent\":\"30000\",\"deposit\":\"0\",\"lockin\":\"3\","
                + "\"notice\":\"1\",\"dueDay\":\"5\",\"increment\":\"5\",\"startDate\":\"" + start + "\"}}";
    }

    private String create(User caller, Property property, String stateJson) throws Exception {
        String listing = property == null ? "" : ",\"propertyId\":\"" + property.getId() + "\"";
        String body = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"rent-agreement\"" + listing + ",\"details\":{\"_state\":" + stateJson + "}}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(body, "id");
    }

    private String tenantRaised(User tenant, User owner) throws Exception {
        return create(tenant, null, state(owner.getMobile(), tenant.getMobile()));
    }

    private String tenantFirst(User tenant, User owner) throws Exception {
        String id = tenantRaised(tenant, owner);
        decide(owner, field(invite(tenant, id, owner), "id"));
        return id;
    }

    private String invite(User requester, String id, User owner) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.PARTIES, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requester))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"owner\",\"partyIndex\":0,\"mobile\":\"" + owner.getMobile() + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private void decide(User invitee, String partyId) throws Exception {
        mvc.perform(post(Routes.ServiceRequests.INVITE_DECISION, partyId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(invitee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"accept\"}"))
                .andExpect(status().isOk());
    }
}

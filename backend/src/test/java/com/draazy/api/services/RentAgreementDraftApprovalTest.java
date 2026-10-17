package com.draazy.api.services;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import com.draazy.api.services.request.ServiceRequestStatus;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Rent agreement draft approvals")
class RentAgreementDraftApprovalTest extends ServiceFixtures {

    @Test
    @DisplayName("the requester approval waits for an inline tenant OTP before the draft is approved")
    void inlineTenantApprovesByOtp() throws Exception {
        User owner = customer("9820006101");
        User desk = staff("9820006102", Teams.RENTAL);
        String tenantMobile = "9820006103";
        String id = raiseWithState(owner, listing(owner), "{\"owner\":{\"oMobile\":\"" + owner.getMobile()
                + "\"},\"tenants\":[{\"name\":\"Ria\",\"mobile\":\"" + tenantMobile
                + "\"}],\"terms\":{\"rent\":\"25000\",\"months\":\"11\"}}");

        setStatus(desk, id, "assigned", 200);
        shareDraft(desk, id, 200);
        openDraft(owner, id, 204);
        decide(owner, id, "approve", 200);

        String detail = detail(owner, id);
        org.assertj.core.api.Assertions.assertThat(detail).contains("\"approved\":1", "\"total\":2");
        String partyKey = detail.replaceAll("(?s)^.*?\"key\":\"([^\"]+)\",\"label\":\"Tenant 1\".*$", "$1");
        mvc.perform(post(Routes.ServiceRequests.DRAFT_OTP, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partyKey\":\"" + partyKey + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approvalRecorded").value(false));
        forceOtp(tenantMobile);
        mvc.perform(post(Routes.ServiceRequests.DRAFT_OTP, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partyKey\":\"" + partyKey + "\",\"otp\":\"424242\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approvalRecorded").value(true));
        expectStatus(owner, id, "approved");
    }

    @Test
    @DisplayName("a high-rent draft waits for a different operator before the customer sees it")
    void riskyDraftNeedsSecondOperator() throws Exception {
        User owner = customer("9820006111");
        User holder = staff("9820006112", Teams.RENTAL);
        User checker = staff("9820006113", Teams.RENTAL);
        String id = raiseWithState(owner, listing(owner), "{\"owner\":{\"oMobile\":\"" + owner.getMobile()
                + "\"},\"tenants\":[{\"name\":\"Ria\",\"mobile\":\"9820006114\"}],"
                + "\"terms\":{\"rent\":\"55000\",\"months\":\"11\"}}");

        setStatus(holder, id, "assigned", 200);
        shareDraft(holder, id, 200);

        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("assigned"))
                .andExpect(jsonPath("$.documents[?(@.category=='draft')]").isEmpty());
        mvc.perform(post(Routes.ServiceRequests.DRAFT_CHECK, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(holder))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"release\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(Routes.ServiceRequests.DRAFT_CHECK, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(checker))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"release\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("draft-shared"))
                .andExpect(jsonPath("$.draftCheck.reasons[0]").value("rent_ge_50000"));
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("draft-shared"))
                .andExpect(jsonPath("$.documents[?(@.category=='draft')]", org.hamcrest.Matchers.hasSize(1)));
    }

    @Test
    @DisplayName("a revision held for a second check leaves no trace for the customer and cannot be approved")
    void heldRevisionCannotBeApproved() throws Exception {
        User owner = customer("9820006121");
        User holder = staff("9820006122", Teams.RENTAL);
        User checker = staff("9820006123", Teams.RENTAL);
        String id = raiseWithState(owner, listing(owner), "{\"owner\":{\"oMobile\":\"" + owner.getMobile()
                + "\"},\"tenants\":[{\"name\":\"Ria\",\"mobile\":\"9820006124\"}],"
                + "\"terms\":{\"rent\":\"55000\",\"months\":\"11\"}}");
        setStatus(holder, id, "assigned", 200);
        shareDraft(holder, id, 200);
        String partyKey = detail(holder, id)
                .replaceAll("(?s)^.*?\"key\":\"([^\"]+)\",\"label\":\"Tenant 1\".*$", "$1");
        draftOtp(owner, id, partyKey, 409);

        checkDraft(checker, id, "release", 200);
        shareDraft(holder, id, 200);

        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draftCheck").doesNotExist())
                .andExpect(jsonPath("$.draftApproval").doesNotExist())
                .andExpect(jsonPath("$.timeline[?(@.event =~ /draft\\.check.*/)]").isEmpty())
                .andExpect(jsonPath("$.documents[?(@.category=='draft')]").isEmpty());
        openDraft(owner, id, 409);
        decide(owner, id, "approve", 409);
        reject(owner, id, "Clause 7 is wrong", 409);
        draftOtp(owner, id, partyKey, 409);
        expectStatus(owner, id, "draft-shared");
    }

    @Test
    @DisplayName("a revision the checker sends back stays hidden and cannot be approved, and the check stays internal")
    void sentBackRevisionStaysHidden() throws Exception {
        User owner = customer("9820006141");
        User holder = staff("9820006142", Teams.RENTAL);
        User checker = staff("9820006143", Teams.RENTAL);
        String id = raiseWithState(owner, listing(owner), "{\"owner\":{\"oMobile\":\"" + owner.getMobile()
                + "\"},\"tenants\":[{\"name\":\"Ria\",\"mobile\":\"9820006144\"}],"
                + "\"terms\":{\"rent\":\"55000\",\"months\":\"11\"}}");
        setStatus(holder, id, "assigned", 200);
        shareDraft(holder, id, 200);
        checkDraft(checker, id, "release", 200);
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.draftCheck").doesNotExist());
        em.flush();
        String first = jdbc.queryForObject("select id::text from documents where service_request_id = ?::uuid"
                + " and category = 'draft'", String.class, id);
        shareDraft(holder, id, 200);
        mvc.perform(post(Routes.ServiceRequests.DRAFT_CHECK, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(checker))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"send-back\",\"note\":\"Clause 7 names the wrong flat\"}"))
                .andExpect(status().isOk());
        em.flush();
        String revision = jdbc.queryForObject("select id::text from documents where service_request_id = ?::uuid"
                + " and category = 'draft' and id <> ?::uuid", String.class, id, first);

        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.draftCheck").doesNotExist())
                .andExpect(jsonPath("$.documents[?(@.category=='draft')]").isEmpty());
        mvc.perform(get(Routes.ServiceRequests.DOC_URL, id, revision).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNotFound());
        openDraft(owner, id, 409);
        decide(owner, id, "approve", 409);
        expectStatus(owner, id, "draft-shared");

        shareDraft(holder, id, 200);
        checkDraft(checker, id, "release", 200);
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.documents[?(@.category=='draft')]", org.hamcrest.Matchers.hasSize(2)))
                .andExpect(jsonPath("$.documents[?(@.id=='" + revision + "')]").isEmpty());
        mvc.perform(get(Routes.ServiceRequests.DOC_URL, id, revision).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("staff who are a side of the agreement see a held draft exactly as a customer would")
    void staffPartyCannotSeeAHeldDraft() throws Exception {
        User insider = staff("9820006131", Teams.RENTAL);
        User holder = staff("9820006132", Teams.RENTAL);
        String id = raiseWithState(insider, listing(insider), "{\"owner\":{\"oMobile\":\"" + insider.getMobile()
                + "\"},\"tenants\":[{\"name\":\"Ria\",\"mobile\":\"9820006134\"}],"
                + "\"terms\":{\"rent\":\"55000\",\"months\":\"11\"}}");
        setStatus(holder, id, "assigned", 200);
        shareDraft(holder, id, 200);
        em.flush();
        String draftId = jdbc.queryForObject("select id::text from documents where service_request_id = ?::uuid"
                + " and category = 'draft'", String.class, id);

        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(insider)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.draftCheck").doesNotExist())
                .andExpect(jsonPath("$.timeline[?(@.event =~ /draft\\.check.*/)]").isEmpty())
                .andExpect(jsonPath("$.documents[?(@.category=='draft')]").isEmpty());
        mvc.perform(get(Routes.ServiceRequests.DOC_URL, id, draftId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(insider)))
                .andExpect(status().isNotFound());
    }

    private void checkDraft(User caller, String id, String decision, int expected) throws Exception {
        mvc.perform(post(Routes.ServiceRequests.DRAFT_CHECK, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"" + decision + "\"}"))
                .andExpect(status().is(expected));
    }

    private void draftOtp(User caller, String id, String partyKey, int expected) throws Exception {
        mvc.perform(post(Routes.ServiceRequests.DRAFT_OTP, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"partyKey\":\"" + partyKey + "\"}"))
                .andExpect(status().is(expected));
    }

    private String raiseWithState(User caller, Property property, String stateJson) throws Exception {
        String json = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"rent-agreement\",\"propertyId\":\"" + property.getId()
                                + "\",\"details\":{\"rent\":" + rentFrom(stateJson) + ",\"deposit\":100000,\"months\":11,"
                                + "\"startDate\":\"2026-04-01\",\"_state\":"
                                + stateJson.replaceFirst("^\\{", "{\"prop\":{\"gramPanchayat\":false},") + "}}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = field(json, "id");
        requestRepo.findById(UUID.fromString(id))
                .filter(r -> r.getStatus() == ServiceRequestStatus.AWAITING_PAYMENT)
                .ifPresent(r -> serviceRequests.applyWebhookOutcome(paymentRef(id), true, null, null));
        return id;
    }

    private static int rentFrom(String stateJson) {
        return stateJson.contains("\"rent\":\"55000\"") ? 55000 : 25000;
    }

    private void forceOtp(String mobile) {
        em.flush();
        jdbc.update("update otp_codes set code_hash = encode(sha256(convert_to('424242', 'UTF8')), 'hex')"
                + " where id = (select id from otp_codes where mobile = ? order by created_at desc limit 1)", mobile);
        em.clear();
    }
}

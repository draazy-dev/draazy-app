package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.trust.RegisteredTenancyLookup;
import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.agreement.RentAgreement;
import com.draazy.api.documents.agreement.RentAgreementRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import com.draazy.api.services.request.ServiceRequestStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("Rent agreement registration — from paid request to trust evidence")
class RentAgreementRegistrationTest extends ServiceFixtures {
    private static final String TENANT_ONE = "9876500001";
    private static final String TENANT_TWO = "9876500002";
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    RentAgreementRepository agreements;

    @Autowired
    RegisteredTenancyLookup tenancies;

    private String raiseWithTenants(User caller, Property property) throws Exception {
        return raise(caller, property, "{\"tenants\":["
                + "{\"name\":\"Kiran Tenant\",\"mobile\":\"" + TENANT_ONE + "\"},"
                + "{\"name\":\"Meera Tenant\",\"mobile\":\"+91 98765 00002\"}]}");
    }

    private static String request(Property property, String stateJson) {
        String propertyId = property == null ? "" : "\"propertyId\":\"" + property.getId() + "\",";
        return "{\"type\":\"rent-agreement\"," + propertyId
                + "\"details\":{\"rent\":25000,\"deposit\":100000,\"months\":11,"
                + "\"startDate\":\"2026-04-01\",\"_state\":" + withGramPanchayat(stateJson) + "}}";
    }

    private static String withGramPanchayat(String stateJson) {
        return stateJson.contains("\"prop\"")
                ? stateJson : stateJson.replaceFirst("^\\{", "{\"prop\":{\"gramPanchayat\":false},");
    }

    private static String onFlat(String rest) {
        return "{\"prop\":{\"gramPanchayat\":false,\"propType\":\"Flat / Apartment\",\"flatNo\":\"B-704\","
                + "\"society\":\"Green Meadows\",\"locality\":\"Kothrud\",\"city\":\"Pune\","
                + "\"pincode\":\"411038\",\"area\":\"950\",\"areaUnit\":\"sqft\"}," + rest + "}";
    }

    private static final String TENANTS = "\"tenants\":[{\"name\":\"Kiran Tenant\",\"mobile\":\"" + TENANT_ONE
            + "\"},{\"name\":\"Meera Tenant\",\"mobile\":\"" + TENANT_TWO + "\"}]";

    private static String ownedBy(User owner, String rest) {
        return onFlat("\"owner\":{\"oName\":\"" + owner.getName() + "\",\"oMobile\":\"" + owner.getMobile()
                + "\"}," + rest);
    }

    private String raise(User caller, Property property, String stateJson) throws Exception {
        String json = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(request(property, stateJson)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return settle(field(json, "id"));
    }

    private String settle(String id) {
        requestRepo.findById(UUID.fromString(id))
                .filter(r -> r.getStatus() == ServiceRequestStatus.AWAITING_PAYMENT)
                .ifPresent(r -> serviceRequests.applyWebhookOutcome(paymentRef(id), true, null, null));
        return id;
    }

    private String raiseWithInvitee(User owner, Property property, User tenant) throws Exception {
        String created = mvc.perform(post(Routes.ServiceRequests.CO_FILL_CREATE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"request\":" + request(property, "{\"tenantMode\":\"fill\",\"tenants\":["
                                + "{\"name\":\"Meera Tenant\",\"mobile\":\"" + TENANT_TWO + "\"}]}")
                                + ",\"role\":\"tenant\",\"mobile\":\"" + tenant.getMobile() + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String invites = mvc.perform(get(Routes.ServiceRequests.MY_INVITES)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        mvc.perform(post(Routes.ServiceRequests.INVITE_DECISION, field(invites, "id"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"accept\"}"))
                .andExpect(status().isOk());
        return settle(field(created, "id"));
    }

    private String completed(User customer, Property property, User desk) throws Exception {
        return complete(raiseWithTenants(customer, property), customer, desk);
    }

    private String complete(String id, User customer, User desk) throws Exception {
        setStatus(desk, id, "assigned", 200);
        shareDraft(desk, id, 200);
        approveAllDraftParties(id, customer);
        finalDoc(desk, id, 201);
        return id;
    }

    private void approveAllDraftParties(String id, User requester) throws Exception {
        openDraft(requester, id, 204);
        decide(requester, id, "approve", 200);
        for (String userId : jdbc.queryForList("""
                select user_id::text
                  from service_request_parties
                 where request_id = ?::uuid
                   and status = 'accepted'
                   and user_id is not null
                """, String.class, id)) {
            User party = users.findById(UUID.fromString(userId)).orElseThrow();
            openDraft(party, id, 204);
            decide(party, id, "approve", 200);
        }
        approveInlinePartiesByOtp(id, requester);
    }

    private void approveInlinePartiesByOtp(String id, User requester) throws Exception {
        JsonNode parties = JSON.readTree(detail(requester, id)).path("draftApproval").path("parties");
        for (JsonNode party : parties) {
            if (!"otp".equals(party.path("method").asText()) || party.path("approved").asBoolean()) {
                continue;
            }
            String key = party.path("key").asText();
            mvc.perform(post(Routes.ServiceRequests.DRAFT_OTP, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(requester))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(JSON.writeValueAsString(Map.of("partyKey", key))))
                    .andExpect(status().isOk());
            forceDraftOtp(id);
            mvc.perform(post(Routes.ServiceRequests.DRAFT_OTP, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(requester))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(JSON.writeValueAsString(Map.of("partyKey", key, "otp", "424242"))))
                    .andExpect(status().isOk());
        }
    }

    private void forceDraftOtp(String id) {
        em.flush();
        jdbc.update("update otp_codes set code_hash = encode(sha256(convert_to('424242', 'UTF8')), 'hex')"
                + " where id = (select id from otp_codes where purpose like ? order by created_at desc limit 1)",
                "draft-approval:" + id + ":%");
        em.clear();
    }

    private List<RentAgreement> rows(String requestId) {
        return agreements.findByServiceRequestIdOrderByCreatedAtAsc(UUID.fromString(requestId));
    }

    private RentAgreement row(String requestId, String mobile) {
        return agreements.findByServiceRequestIdOrderByCreatedAtAsc(UUID.fromString(requestId))
                .stream().filter(a -> a.getTenantMobile().equals(mobile)).findFirst().orElseThrow();
    }

    private void verify(User caller, UUID agreementId, String next, int expected) throws Exception {
        mvc.perform(patch(Routes.Moderation.RENT_AGREEMENT_BY_ID, agreementId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"" + next + "\"}"))
                .andExpect(status().is(expected));
    }

    @Test
    @DisplayName("a flat that was never listed still completes; there is no listing to badge, so no rows")
    void unlistedFlatCompletesWithoutRows() throws Exception {
        User owner = customer("9820004051");
        User desk = staff("9820004052", Teams.RENTAL);

        String id = completed(owner, null, desk);

        expectStatus(owner, id, "completed");
        assertThat(rows(id)).isEmpty();
    }

    @Test
    @DisplayName("the registered copy carries what the Sub-Registrar gave it")
    void registrationRecordIsRequiredAndShown() throws Exception {
        User owner = customer("9820004061");
        User desk = staff("9820004062", Teams.RENTAL);
        String id = raiseWithTenants(owner, null);
        setStatus(desk, id, "assigned", 200);
        shareDraft(desk, id, 200);
        approveAllDraftParties(id, owner);

        finalDoc(desk, id, Map.of(), 422)
                .andExpect(jsonPath("$.message", allOf(
                        containsString("document number"),
                        containsString("GRAS challan GRN"))));
        var future = registration();
        future.put("registeredOn", LocalDate.now(PlatformTime.IST)
                .plusDays(1).toString());
        future.put("grn", "12345678901234");
        finalDoc(desk, id, future, 422)
                .andExpect(jsonPath("$.message", allOf(
                        containsString("registration date"),
                        containsString("GRAS challan GRN"),
                        not(containsString("document number")))));
        expectStatus(owner, id, "approved");

        var record = registration();
        record.put("documentNo", "hvl11-4321-" + LocalDate.now(PlatformTime.IST).getYear());
        finalDoc(desk, id, record, 201);
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.status").value("completed"))
                .andExpect(jsonPath("$.registration.documentNo").value(record.get("documentNo").toUpperCase()))
                .andExpect(jsonPath("$.registration.sro").value("Haveli 11"))
                .andExpect(jsonPath("$.registration.grn").value(record.get("grn")))
                .andExpect(jsonPath("$.registration.stampDuty").doesNotExist())
                .andExpect(jsonPath("$.registration.recordedBy").isNotEmpty());

        User other = customer("9820004063");
        String second = raiseWithTenants(other, null);
        setStatus(desk, second, "assigned", 200);
        shareDraft(desk, second, 200);
        approveAllDraftParties(second, other);
        var reusedChallan = registration();
        reusedChallan.put("grn", record.get("grn").toLowerCase());
        finalDoc(desk, second, reusedChallan, 409)
                .andExpect(jsonPath("$.message", containsString("one challan pays for one document")));
        var sameNumber = registration();
        sameNumber.put("documentNo", record.get("documentNo"));
        sameNumber.put("sro", "HAVELI 11");
        finalDoc(desk, second, sameNumber, 409);
        finalDoc(desk, second, 201);
    }

    @Test
    @DisplayName("a rent-agreement draft is shared only once every drafting check is ticked, and the ticks are audited")
    void draftNeedsTheChecklist() throws Exception {
        User owner = customer("9820004071");
        User desk = staff("9820004072", Teams.RENTAL);
        String id = raiseWithTenants(owner, null);
        setStatus(desk, id, "assigned", 200);

        mvc.perform(multipart(Routes.ServiceRequests.DRAFT, id)
                        .file(new MockMultipartFile("file", "draft.pdf", "application/pdf", "%PDF-1.4 d".getBytes()))
                        .param("checks", "identity", "terms")
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message", allOf(
                        containsString("ownership proof names the licensors"),
                        containsString("power of attorney checked"),
                        not(containsString("ID numbers match")))));
        expectStatus(owner, id, "assigned");

        shareDraft(desk, id, 200);
        try {
            assertThat(jdbc.queryForObject("select metadata->>'checks' from audit_log"
                    + " where action = 'service-request.draft-shared' and entity_id = ?", String.class, id))
                    .isEqualTo("identity,title,poa,address,terms");
        } finally {
            jdbc.update("delete from audit_log where entity_id = ?", id);
        }
    }

    @Test
    @DisplayName("the final upload prepares one draft row per tenant; a second operator registers it")
    void finalUploadPreparesRowsAndACheckerRegistersThem() throws Exception {
        User owner = customer("9820004001");
        Property p = listing(owner);
        User maker = staff("9820004002", Teams.RENTAL);
        User checker = staff("9820004003", Teams.RENTAL);
        String id = complete(raiseWithInvitee(owner, p, customer(TENANT_ONE)), owner, maker);

        RentAgreement first = row(id, TENANT_ONE);
        assertThat(row(id, TENANT_TWO).getStatus()).isEqualTo("draft");
        assertThat(first.getOwnerId()).isEqualTo(owner.getId());
        assertThat(first.getRent()).isEqualTo(25000L);
        assertThat(first.getDurationMonths()).isEqualTo(11);
        assertThat(first.getFinalDocumentId()).isNotNull();
        assertThat(agreements.hasRegisteredTenancy(p.getId(), TENANT_ONE)).isFalse();

        mvc.perform(get(Routes.ServiceRequests.RENT_AGREEMENTS, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(checker)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[?(@.tenantName=='Meera Tenant')].otpVerified").value(false))
                .andExpect(jsonPath("$[?(@.tenantName!='Meera Tenant')].otpVerified").value(true))
                .andExpect(jsonPath("$[*].tenantMobile", hasItem(TENANT_ONE)))
                .andExpect(jsonPath("$[0].preparedBy").value("Rohit Desk"))
                .andExpect(jsonPath("$[0].preparedByYou").value(false));

        verify(maker, first.getId(), "registered", 403);
        assertThat(agreements.hasRegisteredTenancy(p.getId(), TENANT_ONE)).isFalse();

        verify(checker, first.getId(), "registered", 200);
        assertThat(agreements.hasRegisteredTenancy(p.getId(), TENANT_ONE)).isTrue();
        assertThat(tenancies.hasRegisteredTenancy(p.getId(), "+91 98765 00001")).isTrue();
        assertThat(row(id, TENANT_ONE).getVerifiedBy()).isEqualTo(checker.getId());
        assertThat(agreements.hasRegisteredTenancy(p.getId(), TENANT_TWO)).isFalse();

        verify(checker, row(id, TENANT_TWO).getId(), "registered", 422);
        assertThat(row(id, TENANT_TWO).getStatus()).isEqualTo("draft");
        verify(checker, row(id, TENANT_TWO).getId(), "expired", 200);
        verify(checker, first.getId(), "draft", 422);
    }

    @Test
    @DisplayName("the registration check is its own grant: services:write cannot confirm without registrations:write")
    void registrationCheckIsItsOwnGrant() throws Exception {
        User owner = customer("9820004130");
        Property p = listing(owner);
        String id = complete(raiseWithInvitee(owner, p, customer(TENANT_ONE)), owner,
                staff("9820004131", Teams.RENTAL));
        User maker = staff("9820004132", Teams.RENTAL);
        User checker = staff("9820004133", Teams.RENTAL);
        scope(maker, "[\"support\"]");
        scope(checker, "[\"desk:rental\"]");

        verify(maker, row(id, TENANT_ONE).getId(), "registered", 403);
        assertThat(agreements.hasRegisteredTenancy(p.getId(), TENANT_ONE)).isFalse();
        verify(checker, row(id, TENANT_ONE).getId(), "registered", 200);
    }

    private void scope(User user, String permissions) {
        jdbc.update("""
                INSERT INTO back_office_permissions (user_id, permissions)
                VALUES (?::uuid, ?::jsonb)
                ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions
                """,
                user.getId().toString(), permissions);
    }

    @Test
    @DisplayName("a checker on another desk, or who is a tenant on the agreement, is refused")
    void checkerMustBeOnTheDeskAndNotASignatory() throws Exception {
        User owner = customer("9820004011");
        Property p = listing(owner);
        String id = completed(owner, p, staff("9820004012", Teams.RENTAL));

        verify(staff("9820004013", Teams.LEGAL), row(id, TENANT_ONE).getId(), "registered", 403);
        verify(staff(TENANT_TWO, Teams.RENTAL), row(id, TENANT_TWO).getId(), "registered", 403);
        assertThat(agreements.hasRegisteredTenancy(p.getId(), TENANT_TWO)).isFalse();
    }

    @Test
    @DisplayName("staff who raised a request as themselves cannot work it — a colleague has to")
    void staffRequesterCannotWorkTheirOwnRequest() throws Exception {
        User insider = staff("9820004021", Teams.RENTAL);
        User colleague = staff("9820004022", Teams.RENTAL);
        User checker = staff("9820004023", Teams.RENTAL);
        Property p = listing(insider);
        String id = raiseWithTenants(insider, p);

        setStatus(insider, id, "assigned", 403);
        setStatus(colleague, id, "assigned", 200);
        shareDraft(insider, id, 403);
        shareDraft(colleague, id, 200);

        expectStatus(insider, id, "draft-shared");
        approveAllDraftParties(id, insider);

        finalDoc(insider, id, 403);
        finalDoc(colleague, id, 201);

        mvc.perform(get(Routes.ServiceRequests.RENT_AGREEMENTS, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(insider)))
                .andExpect(status().isForbidden());
        verify(insider, row(id, TENANT_ONE).getId(), "registered", 403);
        verify(checker, row(id, TENANT_ONE).getId(), "expired", 200);
    }

    @Test
    @DisplayName("an admin who owns the listing is refused too — there is no admin exemption")
    void adminListingOwnerIsRefused() throws Exception {
        User boss = admin("9820004031");
        User owner = customer("9820004032");
        Property p = listing(boss);
        String id = raiseWithTenants(owner, p);

        setStatus(boss, id, "assigned", 403);
    }

    @Test
    @DisplayName("only the operator holding the request uploads its registered copy")
    void finalUploadBelongsToTheHolder() throws Exception {
        User owner = customer("9820004041");
        User holder = staff("9820004042", Teams.RENTAL);
        User other = staff("9820004043", Teams.RENTAL);
        String id = raiseWithTenants(owner, listing(owner));
        setStatus(holder, id, "assigned", 200);
        shareDraft(holder, id, 200);
        approveAllDraftParties(id, owner);

        finalDoc(other, id, 409);
        expectStatus(holder, id, "approved");
        assertThat(rows(id)).isEmpty();

        finalDoc(admin("9820004044"), id, 201);
        assertThat(rows(id)).hasSize(2);
    }

    @Test
    @DisplayName("rows come only from numbers that can be a tenant: invite-mode leftovers and invalid mobiles are dropped")
    void onlyPlausibleTenantMobilesBecomeRows() throws Exception {
        User owner = customer("9820004051");
        User desk = staff("9820004052", Teams.RENTAL);
        String typo = complete(raise(owner, listing(owner), "{\"tenantMode\":\"fill\",\"tenants\":["
                + "{\"name\":\"Kiran Tenant\",\"mobile\":\"" + TENANT_ONE + "\"},"
                + "{\"name\":\"Typo\",\"mobile\":\"5123456789\"}]}"), owner, desk);
        assertThat(rows(typo)).extracting(RentAgreement::getTenantMobile).containsExactly(TENANT_ONE);

        String invitedId = raise(owner, listing(owner), "{\"tenantMode\":\"invite\",\"tenants\":["
                + "{\"name\":\"Before switching\",\"age\":\"30\",\"mobile\":\"" + TENANT_TWO + "\"}]}");
        mvc.perform(put(Routes.ServiceRequests.IDENTITIES, invitedId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"parties\":[{\"partyRole\":\"tenant\",\"partyIndex\":0,"
                                + "\"partyName\":\"Before switching\",\"pan\":\"FGHIJ5678K\"}]}"))
                .andExpect(status().isNoContent());
        String invited = complete(invitedId, owner, desk);
        assertThat(rows(invited)).isEmpty();
    }

    @Test
    @DisplayName("a tenant sees the agreement and its copy only once a checker has registered it")
    void tenantSeesTheRowOnlyOnceRegistered() throws Exception {
        User owner = customer("9820004061");
        User tenant = customer(TENANT_ONE);
        String id = complete(raiseWithInvitee(owner, listing(owner), tenant), owner,
                staff("9820004062", Teams.RENTAL));

        mvc.perform(get(Routes.MeRentAgreements.BASE).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
        mvc.perform(get(Routes.MeRentAgreements.BASE).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$", hasSize(2)));

        verify(staff("9820004063", Teams.RENTAL), row(id, TENANT_ONE).getId(), "registered", 200);
        mvc.perform(get(Routes.MeRentAgreements.BASE).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].status").value("registered"))
                .andExpect(jsonPath("$[0].documentUrl").isNotEmpty());
    }

    @Test
    @DisplayName("a customer cannot file a 'registered copy' of their own, nor add files once the matter is closed")
    void customerCannotPlantTheDesksFiles() throws Exception {
        User owner = customer("9820004071");
        String open = raiseWithTenants(owner, listing(owner));
        upload(owner, open, "final-document", 422);
        upload(owner, open, " draft ", 422);
        upload(owner, open, "rent-receipt", 201);

        String closed = completed(owner, listing(owner), staff("9820004072", Teams.RENTAL));
        upload(owner, closed, "rent-receipt", 409);
    }

    @Test
    @DisplayName("staff the customer typed in as a tenant cannot work the request that would badge them")
    void typedTenantStaffIsRefused() throws Exception {
        User owner = customer("9820004081");
        String id = raiseWithTenants(owner, listing(owner));
        setStatus(staff(TENANT_ONE, Teams.RENTAL), id, "assigned", 403);
    }

    @Test
    @DisplayName("staff typed in as the licensor or a co-owner cannot work the request either")
    void typedLicensorStaffAreRefused() throws Exception {
        User owner = customer("9820004120");
        User licensor = staff("9820004121", Teams.RENTAL);
        User coOwner = staff("9820004122", Teams.RENTAL);
        String id = raise(owner, listing(owner), "{\"owner\":{\"oMobile\":\"+91 98200 04121\",\"capacity\":\"co-owner\"},"
                + "\"coOwners\":[{\"name\":\"Asha\",\"mobile\":\"9820004122\"}]}");

        setStatus(licensor, id, "assigned", 403);
        setStatus(coOwner, id, "assigned", 403);
        setStatus(staff("9820004124", Teams.RENTAL), id, "assigned", 200);
    }

    @Test
    @DisplayName("a request the listing's owner took no part in prepares no tenancy rows")
    void strangersListingPreparesNothing() throws Exception {
        User landlord = customer("9820004091");
        User stranger = customer("9820004092");
        String id = completed(stranger, listing(landlord), staff("9820004093", Teams.RENTAL));
        assertThat(rows(id)).isEmpty();
    }

    @Test
    @DisplayName("a tenant who raised the request proved their number at sign-in, so their row can be registered")
    void tenantRequesterIsVerifiedByTheirOwnSignIn() throws Exception {
        User owner = customer("9820004101");
        User tenant = customer("9820004102");
        Property p = listing(owner);
        String created = mvc.perform(post(Routes.ServiceRequests.CO_FILL_CREATE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"request\":" + request(p, "{\"tenantMode\":\"fill\",\"tenants\":["
                                + "{\"name\":\"Meera Tenant\",\"mobile\":\"" + TENANT_TWO + "\"}]}")
                                + ",\"role\":\"owner\",\"mobile\":\"" + owner.getMobile() + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String invites = mvc.perform(get(Routes.ServiceRequests.MY_INVITES)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andReturn().getResponse().getContentAsString();
        mvc.perform(post(Routes.ServiceRequests.INVITE_DECISION, field(invites, "id"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"accept\"}"))
                .andExpect(status().isOk());
        String id = complete(settle(field(created, "id")), tenant, staff("9820004103", Teams.RENTAL));

        User checker = staff("9820004104", Teams.RENTAL);
        verify(checker, row(id, TENANT_TWO).getId(), "registered", 422);
        verify(checker, row(id, tenant.getMobile()).getId(), "registered", 200);
        assertThat(agreements.hasRegisteredTenancy(p.getId(), tenant.getMobile())).isTrue();
    }

    private JsonNode homesOf(User owner) throws Exception {
        return JSON.readTree(mvc.perform(get(Routes.MeManagedProperties.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    @Test
    @DisplayName("a nameless owner verified by the agreement takes the licensor name, since a verified name is locked")
    void namelessOwnerTakesTheLicensorName() throws Exception {
        User owner = customer("9820004503");
        user(TENANT_ONE, Roles.Wire.BUYER, null, "Kiran Tenant");
        User desk = staff("9820004504", Teams.RENTAL);
        String state = onFlat("\"owner\":{\"oName\":\"Asha Licensor\",\"oMobile\":\"" + owner.getMobile() + "\"}," + TENANTS);
        String id = raise(owner, null, state);
        jdbc.update("update users set name = null where id = ?", owner.getId());

        complete(id, owner, desk);

        assertThat(jdbc.queryForMap("select name, verified from users where id = ?", owner.getId()))
                .containsEntry("name", "Asha Licensor").containsEntry("verified", true);
    }

    @Test
    @DisplayName("a nameless owner with no licensor name stays unverified, so they can still set their name")
    void namelessOwnerWithoutLicensorNameIsNotVerified() throws Exception {
        User owner = customer("9820004505");
        user(TENANT_ONE, Roles.Wire.BUYER, null, "Kiran Tenant");
        User desk = staff("9820004506", Teams.RENTAL);
        String id = raise(owner, null, onFlat("\"owner\":{\"oMobile\":\"" + owner.getMobile() + "\"}," + TENANTS));
        jdbc.update("update users set name = null where id = ?", owner.getId());

        complete(id, owner, desk);

        assertThat(jdbc.queryForObject("select verified from users where id = ?", Boolean.class, owner.getId())).isFalse();
        mvc.perform(patch(Routes.Auth.ME).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Asha Owner\"}"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a registered agreement puts the flat in the owner's hub and the rent on the tenant's dashboard")
    void registeredAgreementSeedsBothDashboards() throws Exception {
        User owner = customer("9820004501");
        User tenant = user(TENANT_ONE, Roles.Wire.BUYER, null, "Kiran Tenant");
        User desk = staff("9820004502", Teams.RENTAL);

        complete(raise(owner, null, ownedBy(owner, TENANTS)), owner, desk);

        JsonNode homes = homesOf(owner);
        assertThat(homes).hasSize(1);
        JsonNode home = homes.get(0);
        assertThat(home.path("rented").asBoolean()).isTrue();
        assertThat(home.path("visibility").asText()).isEqualTo("private");
        assertThat(home.path("deal").asText()).isEqualTo("rent");
        assertThat(home.path("society").asText()).isEqualTo("Green Meadows");
        assertThat(home.path("locality").asText()).isEqualTo("Kothrud");
        assertThat(home.path("tenantName").asText()).isEqualTo("Kiran Tenant");
        assertThat(home.path("tenantMobile").asText()).isEqualTo(TENANT_ONE);
        assertThat(home.path("monthlyRent").asLong()).isEqualTo(25000);
        assertThat(home.path("dueDay").asInt()).isEqualTo(1);
        assertThat(home.path("leaseEnd").asText()).isEqualTo("2027-03-01");
        mvc.perform(get(Routes.MeDocuments.FOR_MANAGED, home.path("id").asText())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].category", hasItem("Rent Agreement")));

        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].monthlyRent").value(25000))
                .andExpect(jsonPath("$[0].leaseEnd").value("2027-03-01"));
        mvc.perform(get(Routes.Rentals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].monthlyRent").value(25000))
                .andExpect(jsonPath("$[0].deposit").value(100000))
                .andExpect(jsonPath("$[0].leaseStart").value("2026-04-01"))
                .andExpect(jsonPath("$[0].leaseEnd").value("2027-03-01"));
        assertThat(jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?",
                Long.class, tenant.getId(), "rent.tracking")).isEqualTo(1);
        assertThat(home.path("agreementVerified").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("select verified from users where id = ?", Boolean.class, owner.getId()))
                .isTrue();
        mvc.perform(get(Routes.Verification.IDENTITY).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("verified"));
    }

    @Test
    @DisplayName("registration marks the police informed on both cards, with no desk step")
    void depositAndPoliceIntimationReachBothCards() throws Exception {
        User owner = customer("9820004531");
        User tenant = user(TENANT_ONE, Roles.Wire.BUYER, null, "Kiran Tenant");
        User desk = staff("9820004532", Teams.RENTAL);
        complete(raise(owner, null, ownedBy(owner, TENANTS)), owner, desk);

        JsonNode home = homesOf(owner).get(0);
        assertThat(home.path("deposit").asLong()).isEqualTo(100000);
        assertThat(home.path("policeIntimation").asText()).isEqualTo("done");
        assertThat(home.has("policeIntimatedOn")).isFalse();
        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$[0].deposit").value(100000))
                .andExpect(jsonPath("$[0].policeIntimation").value("done"))
                .andExpect(jsonPath("$[0].policeIntimatedOn").doesNotExist());
    }

    @Test
    @DisplayName("a tenant account with no name takes the name typed on the agreement")
    void unnamedTenantTakesTheFormName() throws Exception {
        User owner = customer("9820004521");
        user(TENANT_ONE, Roles.Wire.BUYER, null, null);
        User desk = staff("9820004522", Teams.RENTAL);

        String id = complete(raise(owner, null, ownedBy(owner, TENANTS)), owner, desk);

        assertThat(requestRepo.findById(UUID.fromString(id)).orElseThrow().getStatus())
                .isEqualTo(ServiceRequestStatus.COMPLETED);
        assertThat(homesOf(owner).get(0).path("tenantName").asText()).isEqualTo("Kiran Tenant");
    }

    @Test
    @DisplayName("renewing the same flat refreshes the owner's record instead of adding a second one")
    void renewalRefreshesTheSameHome() throws Exception {
        User owner = customer("9820004511");
        User desk = staff("9820004512", Teams.RENTAL);

        complete(raise(owner, null, ownedBy(owner, "\"tenants\":[{\"name\":\"Kiran Tenant\",\"mobile\":\""
                + TENANT_ONE + "\"}]")), owner, desk);
        complete(raise(owner, null, ownedBy(owner, "\"tenants\":[{\"name\":\"Meera Tenant\",\"mobile\":\""
                + TENANT_TWO + "\"}]")), owner, desk);

        JsonNode homes = homesOf(owner);
        assertThat(homes).hasSize(1);
        assertThat(homes.get(0).path("tenantName").asText()).isEqualTo("Meera Tenant");
        assertThat(homes.get(0).path("tenantMobile").asText()).isEqualTo(TENANT_TWO);
    }

    @Test
    @DisplayName("an agreement on a listed flat fills the listing's existing record rather than duplicating it")
    void listedFlatFillsItsExistingRecord() throws Exception {
        User owner = customer("9820004521");
        User desk = staff("9820004522", Teams.RENTAL);
        Property p = listing(owner);
        mvc.perform(post(Routes.MeManagedProperties.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"2BHK in Kothrud\",\"deal\":\"rent\",\"propertyType\":\"flat\","
                                + "\"price\":25000,\"locality\":\"Kothrud\",\"publishedListingId\":\""
                                + p.getId() + "\"}"))
                .andExpect(status().isCreated());

        complete(raise(owner, p, ownedBy(owner, TENANTS)), owner, desk);

        JsonNode homes = homesOf(owner);
        assertThat(homes).hasSize(1);
        assertThat(homes.get(0).path("publishedListingId").asText()).isEqualTo(p.getId().toString());
        assertThat(homes.get(0).path("rented").asBoolean()).isTrue();
        assertThat(homes.get(0).path("tenantMobile").asText()).isEqualTo(TENANT_ONE);
        assertThat(jdbc.queryForObject("select ownership_verified from properties where id = ?", Boolean.class,
                p.getId())).isTrue();
    }

    @Test
    @DisplayName("listing an agreement-backed private home later gives the new listing the verified-property badge")
    void publishingAnAgreementHomeVerifiesTheListing() throws Exception {
        User owner = customer("9820004541");
        User desk = staff("9820004542", Teams.RENTAL);
        complete(raise(owner, null, ownedBy(owner, TENANTS)), owner, desk);
        String homeId = homesOf(owner).get(0).path("id").asText();

        mvc.perform(post(Routes.MeManagedProperties.BASE + "/" + homeId + "/listing")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"2 BHK in Kothrud\",\"deal\":\"rent\",\"propertyType\":\"apartment\","
                                + "\"price\":25000,\"locality\":\"Kothrud\",\"city\":\"Pune\","
                                + listingImages(owner) + "}"))
                .andExpect(status().isCreated());

        assertThat(jdbc.queryForObject("""
                select p.ownership_verified from properties p
                  join managed_properties m on m.published_listing_id = p.id
                 where m.id = ?::uuid
                """, Boolean.class, homeId)).isTrue();
    }

    @Test
    @DisplayName("a tenant-started agreement gives the tenant the rental and the OTP-approved owner the record")
    void tenantStartedAgreementSeedsTheOwnerByMobile() throws Exception {
        User tenant = user(TENANT_ONE, Roles.Wire.BUYER, null, "Kiran Tenant");
        User owner = user("9820004531", Roles.Wire.BUYER, null, "Ravi Owner");
        User desk = staff("9820004532", Teams.RENTAL);

        complete(raise(tenant, null, ownedBy(owner, "\"ownerMode\":\"fill\"," + TENANTS)), tenant, desk);

        assertThat(homesOf(tenant)).isEmpty();
        assertThat(homesOf(owner)).hasSize(1);
        mvc.perform(get(Routes.Rentals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$", hasSize(1)));
        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$", hasSize(1)));
    }
}

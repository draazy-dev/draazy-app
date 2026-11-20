package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.admin.alerts.StaffSlaSweep;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("An owner who invites the tenant pays once their own side is done")
class RentAgreementPayBeforeTenantTest extends RentAgreementCoFillFixtures {

    @Autowired
    StaffSlaSweep sweep;

    @Test
    @DisplayName("checkout opens with the invite still pending; the tenant fills in after payment and only then can a draft go out")
    void tenantFillsAfterPayment() throws Exception {
        User owner = customer("9820008101");
        User tenant = customer("9820008102");
        User desk = staff("9820008103", Teams.RENTAL);
        String id = invite(owner, tenant, "invite");
        upload(owner, id, "ownership-proof");

        checkout(owner, id, 409).andExpect(jsonPath("$.message", allOf(
                containsString("Licensor 1"), not(containsString("Tenant")))));

        identities(owner, id, "{\"partyRole\":\"owner\",\"partyIndex\":0,\"partyName\":\"Asha Patil\","
                + "\"pan\":\"ABCDE1234F\"}", 204);
        checkout(owner, id, 200).andExpect(jsonPath("$.paymentSessionId").isNotEmpty());
        pay(id);

        read(owner, id)
                .andExpect(jsonPath("$.status").value("new"))
                .andExpect(jsonPath("$.sla.waitingOn").value("tenant"));
        setStatus(desk, id, "assigned", 200);
        draft(desk, id, 409).andExpect(jsonPath("$.message", allOf(
                containsString("Waiting for the tenant"), containsString("Tenant 1"))));

        accept(tenant);
        partyDetails(tenant, id, "{\"_state\":{\"tenants\":[{\"name\":\"Ria Sharma\",\"age\":\"29\","
                + "\"addr\":\"FC Road, Pune\",\"mobile\":\"" + tenant.getMobile() + "\","
                + "\"residency\":\"nri\",\"passport\":\"Z1234567\"}]}}", 200);
        identities(tenant, id, "{\"partyRole\":\"tenant\",\"partyIndex\":0,\"partyName\":\"Ria Sharma\","
                + "\"pan\":\"FGHIJ5678K\"}", 204);
        identities(tenant, id, "{\"partyRole\":\"owner\",\"partyIndex\":0,\"partyName\":\"Ria Sharma\","
                + "\"pan\":\"FGHIJ5678K\"}", 403);
        draft(desk, id, 409).andExpect(jsonPath("$.message", containsString("Tenant 1 — Passport scan")));

        upload(tenant, id, "tenant-0-passport");
        read(desk, id).andExpect(jsonPath("$.sla.waitingOn").value("desk"));
        shareDraft(desk, id, 200);
        partyDetails(tenant, id, "{\"_state\":{\"tenants\":[{\"name\":\"Ria S\",\"age\":\"29\","
                + "\"mobile\":\"" + tenant.getMobile() + "\"}]}}", 409);
    }

    @Test
    @DisplayName("a withdrawn invite does not hold up checkout either")
    void withdrawnInviteDoesNotBlock() throws Exception {
        User owner = customer("9820008111");
        User tenant = customer("9820008112");
        String id = invite(owner, tenant, "invite");
        upload(owner, id, "ownership-proof");
        identities(owner, id, "{\"partyRole\":\"owner\",\"partyIndex\":0,\"partyName\":\"Asha Patil\","
                + "\"pan\":\"ABCDE1234F\"}", 204);
        String partyId = jdbc.queryForObject("select id::text from service_request_parties where request_id = ?",
                String.class, UUID.fromString(id));
        mvc.perform(delete(Routes.ServiceRequests.PARTY_BY_ID, id, partyId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().is2xxSuccessful());

        checkout(owner, id, 200);
    }

    @Test
    @DisplayName("a co-fill without the invite choice still waits for the tenant before checkout")
    void legacyCoFillStillWaits() throws Exception {
        User owner = customer("9820008121");
        User tenant = customer("9820008122");
        String id = invite(owner, tenant, "fill");
        upload(owner, id, "ownership-proof");
        identities(owner, id, "{\"partyRole\":\"owner\",\"partyIndex\":0,\"partyName\":\"Asha Patil\","
                + "\"pan\":\"ABCDE1234F\"}", 204);

        checkout(owner, id, 409);
    }

    @Test
    @DisplayName("a paid case waiting on the tenant is neither overdue nor counted as overdue on the desk")
    void waitingOnTenantIsNotOverdue() throws Exception {
        User owner = customer("9820008131");
        User desk = staff("9820008133", Teams.RENTAL);
        String waiting = paidInvite(owner, customer("9820008132"));
        String late = raise(owner, "rent-agreement", listing(owner));
        em.flush();
        jdbc.update("update service_requests set status_changed_at = now() - interval '5 hours' where id in (?, ?)",
                UUID.fromString(waiting), UUID.fromString(late));
        em.clear();

        read(desk, waiting).andExpect(jsonPath("$.sla.overdue").value(false));
        mvc.perform(get(Routes.ServiceRequests.BASE).param("overdue", "true")
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(late)));
        mvc.perform(get(Routes.ServiceRequests.QUEUE_SUMMARY).header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.overdue").value(1));
    }

    @Test
    @DisplayName("a paid case waiting on the tenant raises no staff SLA alert")
    void waitingOnTenantRaisesNoStaffAlert() throws Exception {
        String waiting = paidInvite(customer("9820008141"), customer("9820008142"));
        em.flush();
        jdbc.update("update service_requests set status_changed_at = now() - interval '5 hours' where id = ?",
                UUID.fromString(waiting));
        em.clear();

        sweep.sweep(Instant.now());

        assertThat(jdbc.queryForObject("select count(*) from staff_alert_log where rule = 'rent-agreement' and item_id = ?",
                Integer.class, waiting)).isZero();
    }

    private ResultActions draft(User desk, String id, int expected) throws Exception {
        return mvc.perform(multipart(Routes.ServiceRequests.DRAFT, id)
                        .file(new MockMultipartFile("file", "draft.pdf", "application/pdf", "%PDF-1.4 draft".getBytes()))
                        .param("note", "Please review")
                        .param("checks", DRAFT_CHECKS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().is(expected));
    }
}

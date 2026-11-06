package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.services.request.ServiceRequestStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

@DisplayName("A customer deletes a cancelled service request")
class ServiceRequestDeleteTest extends ServiceFixtures {
    @AfterEach
    void clearAudit() {
        jdbc.update("delete from audit_log where action in ('service-request.deleted', 'service-request.dismissed')");
    }

    @Test
    @DisplayName("an unpaid request is erased with its timeline, parties and filed papers")
    void unpaidIsErased() throws Exception {
        User buyer = customer("9820000951");
        User tenant = customer("9820000952");
        String id = raiseUnpaid(buyer, listing(buyer));
        acceptParty(id, tenant, buyer);
        jdbc.update("insert into documents (service_request_id, category, storage_key) values (?::uuid, 'id', ?)",
                id, "requests/" + id + "/scan");
        cancel(buyer, id);

        remove(buyer, id, 204);

        assertThat(count("service_requests", "id", id)).isZero();
        assertThat(count("service_request_timeline", "request_id", id)).isZero();
        assertThat(count("service_request_parties", "request_id", id)).isZero();
        assertThat(count("documents", "service_request_id", id)).isZero();
        expectListed(tenant, id, false);
    }

    @Test
    @DisplayName("a paid request is only hidden from the caller, and the record stays")
    void paidIsHidden() throws Exception {
        User buyer = customer("9820000953");
        String id = raiseUnpaid(buyer, listing(buyer));
        deliverSigned(paymentRef(id), true);
        em.flush();
        jdbc.update("update service_requests set status = 'cancelled' where id = ?::uuid", id);
        em.clear();

        remove(buyer, id, 204);

        assertThat(count("service_requests", "id", id)).isOne();
        expectListed(buyer, id, false);
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an invited party only hides it; the requester still sees it")
    void partyOnlyHides() throws Exception {
        User buyer = customer("9820000954");
        User tenant = customer("9820000955");
        String id = raiseUnpaid(buyer, listing(buyer));
        acceptParty(id, tenant, buyer);
        cancel(buyer, id);

        remove(tenant, id, 204);
        remove(tenant, id, 204);

        assertThat(count("service_requests", "id", id)).isOne();
        expectListed(tenant, id, false);
        expectListed(buyer, id, true);
    }

    @Test
    @DisplayName("a live request is refused, and a stranger gets 404")
    void onlyCancelledAndOnlyYours() throws Exception {
        User buyer = customer("9820000956");
        User other = customer("9820000957");
        String id = raiseUnpaid(buyer, listing(buyer));

        remove(buyer, id, 409);
        cancel(buyer, id);
        remove(other, id, 404);
        expectStatus(buyer, id, ServiceRequestStatus.CANCELLED.wire());
    }

    private void acceptParty(String id, User party, User inviter) {
        jdbc.update("insert into service_request_parties (request_id, user_id, role, status, invited_by)"
                + " values (?::uuid, ?, 'tenant', 'accepted', ?)", id, party.getId(), inviter.getId());
    }

    private void cancel(User caller, String id) throws Exception {
        mvc.perform(post(Routes.ServiceRequests.BY_ID + "/cancel", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isOk());
    }

    private void remove(User caller, String id, int expected) throws Exception {
        mvc.perform(delete(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().is(expected));
    }

    private void expectListed(User caller, String id, boolean listed) throws Exception {
        mvc.perform(get(Routes.ServiceRequests.BASE).header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", listed ? hasItem(id) : not(hasItem(id))));
    }

    private int count(String table, String column, String id) {
        Integer n = jdbc.queryForObject("select count(*) from " + table + " where " + column + " = ?::uuid",
                Integer.class, id);
        return n == null ? 0 : n;
    }
}

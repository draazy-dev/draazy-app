package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import com.draazy.api.services.ticket.Ticket;
import com.draazy.api.services.ticket.TicketRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Slice 11 — concurrent edits on the ops queues")
class OpsQueueConcurrencyTest extends ServiceFixtures {
    @Autowired
    TicketRepository tickets;

    @PersistenceContext
    EntityManager em;

    @Test
    @DisplayName("a stale write loses rather than silently overwriting the winner")
    void staleWriteIsRejected() throws Exception {
        User buyer = customer("9820000801");
        User legal = staff("9820000802", Teams.LEGAL);
        String id = create(buyer, "{\"subject\":\"Rent agreement\",\"team\":\"legal\"}", 201);

        Ticket stale = tickets.findById(UUID.fromString(id)).orElseThrow();
        em.detach(stale);

        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(legal))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"priority\":\"high\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priority").value("high"));
        em.flush();
        assertThat(version(id)).isEqualTo(1L);

        stale.setStatus("closed");
        assertThatThrownBy(() -> tickets.saveAndFlush(stale))
                .isInstanceOf(OptimisticLockingFailureException.class);
    }

    @Test
    @DisplayName("the version column is real and moves on every update")
    void versionIncrementsPerUpdate() throws Exception {
        User buyer = customer("9820000803");
        User legal = staff("9820000804", Teams.LEGAL);
        String id = create(buyer, "{\"subject\":\"Site visit\",\"team\":\"legal\"}", 201);
        em.flush();

        assertThat(version(id)).isZero();

        patchTicket(legal, id, "{\"priority\":\"high\"}");
        assertThat(version(id)).isEqualTo(1L);

        patchTicket(legal, id, "{\"status\":\"in-progress\"}");
        assertThat(version(id)).isEqualTo(2L);
    }

    @Test
    @DisplayName("back-to-back edits by two people both succeed")
    void sequentialEditsBothLand() throws Exception {
        User buyer = customer("9820000805");
        User legal = staff("9820000806", Teams.LEGAL);
        User boss = admin("9820000807");
        String id = create(buyer, "{\"subject\":\"Agreement review\",\"team\":\"legal\"}", 201);

        patchTicket(legal, id, "{\"priority\":\"high\"}");
        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(boss))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"in-progress\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priority").value("high"))
                .andExpect(jsonPath("$.status").value("in-progress"));
    }

    private void patchTicket(User caller, String id, String body) throws Exception {
        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
        em.flush();
    }

    private long version(String id) {
        return jdbc.queryForObject("select version from tickets where id = ?::uuid",
                Long.class, id);
    }

    private String create(User caller, String body, int expected) throws Exception {
        String json = mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
        return field(json, "id");
    }
}

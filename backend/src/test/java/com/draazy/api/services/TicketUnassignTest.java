package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import com.draazy.api.services.ticket.Ticket;
import com.draazy.api.services.ticket.TicketRepository;
import com.draazy.api.services.ticket.TicketUpdate;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Debt D46 — a ticket can be handed back to the pool")
class TicketUnassignTest extends ServiceFixtures {
    @Autowired
    private TicketRepository ticketRepo;

    @Test
    @DisplayName("omitting assigneeId leaves the assignee exactly where it was")
    void omittingAssigneeIdLeavesItAlone() throws Exception {
        User buyer = customer("9820000340");
        User desk = staff("9820000341", Teams.LEGAL);
        String id = assignedTicket(buyer, desk);

        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"waiting\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("waiting"))
                .andExpect(jsonPath("$.assignee").value("Rohit Desk"));

        assertThat(reload(id).getAssigneeId()).isEqualTo(desk.getId());

        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignee").value("Rohit Desk"));

        assertThat(reload(id).getAssigneeId()).isEqualTo(desk.getId());
    }

    @Test
    @DisplayName("the reserved value clears the assignee, and does not disturb the rest of the patch")
    void theSentinelClearsTheAssignee() throws Exception {
        User buyer = customer("9820000342");
        User desk = staff("9820000343", Teams.LEGAL);
        String id = assignedTicket(buyer, desk);

        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"" + TicketUpdate.UNASSIGN + "\","
                                + "\"status\":\"open\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignee").value(nullValue()))
                .andExpect(jsonPath("$.status").value("open"));

        assertThat(reload(id).getAssigneeId()).isNull();

        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"" + desk.getId() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignee").value("Rohit Desk"));
    }

    @Test
    @DisplayName("anything else that is not a staff id is still a 404, sentinel or no sentinel")
    void badInputIsStillRefused() throws Exception {
        User buyer = customer("9820000344");
        User desk = staff("9820000345", Teams.LEGAL);
        String id = assignedTicket(buyer, desk);

        refused(desk, id, "definitely-not-a-uuid");
        refused(desk, id, "NONE");
        refused(desk, id, "no-one");
        refused(desk, id, UUID.randomUUID().toString());

        assertThat(reload(id).getAssigneeId()).isEqualTo(desk.getId());
    }

    private String assignedTicket(User raiser, User assignee) throws Exception {
        String created = mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(raiser))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Rent agreement\",\"team\":\"legal\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = field(created, "id");

        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(assignee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"" + assignee.getId() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignee").value("Rohit Desk"));
        return id;
    }

    private void refused(User caller, String id, String assigneeId) throws Exception {
        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"" + assigneeId + "\"}"))
                .andExpect(status().isNotFound());
    }

    private Ticket reload(String id) {
        return ticketRepo.findById(UUID.fromString(id)).orElseThrow();
    }

    @Test
    @DisplayName("the sentinel cannot collide with a real id")
    void sentinelCannotCollide() {
        assertThat(TicketUpdate.UNASSIGN).isEqualTo("none");
        assertThat(com.draazy.api.common.web.Ids.parseUuid(TicketUpdate.UNASSIGN)).isEmpty();
        assertThat(TicketUpdate.UNASSIGN).isNotEqualTo(Roles.Wire.STAFF);
    }
}

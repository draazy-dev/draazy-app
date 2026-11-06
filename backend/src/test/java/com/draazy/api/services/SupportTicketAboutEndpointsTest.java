package com.draazy.api.services;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Support tickets about a listing, flatmate post or invoice")
class SupportTicketAboutEndpointsTest extends ServiceFixtures {

    @Test
    @DisplayName("a second message about the same listing resumes the open thread")
    void resumesTheOpenThread() throws Exception {
        User owner = customer("9840100001");
        String pid = listing(owner).getId().toString();

        String first = field(raise(owner, "property", pid).andExpect(status().isCreated())
                .andExpect(jsonPath("$.about.type").value("property"))
                .andExpect(jsonPath("$.about.id").value(pid))
                .andReturn().getResponse().getContentAsString(), "id");
        raise(owner, "property", pid.toUpperCase())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(first))
                .andExpect(jsonPath("$.messages", hasSize(2)));

        mvc.perform(get(Routes.SupportTickets.BASE).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].about.id").value(pid));
    }

    @Test
    @DisplayName("a message about a different subject continues the same open thread, tagged with its own subject")
    void aSecondSubjectResumesTheSameThread() throws Exception {
        User owner = customer("9840100010");
        String pid = listing(owner).getId().toString();
        jdbc.update("insert into invoices (number, user_id, source_type, source_id, amount, taxable_amount, issued_at)"
                + " values ('DZ/26-27/000902', ?::uuid, 'subscription', ?::uuid, 499, 423, now())",
                owner.getId().toString(), UUID.randomUUID().toString());
        String first = field(raise(owner, "property", pid).andReturn().getResponse().getContentAsString(), "id");

        raise(owner, "invoice", "DZ/26-27/000902")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(first))
                .andExpect(jsonPath("$.messages", hasSize(2)));

        mvc.perform(get(Routes.SupportTickets.BASE).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$", hasSize(1)));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForList(
                "select about_type from support_ticket_messages where ticket_id = ?::uuid order by created_at, id",
                String.class, first)).containsExactlyInAnyOrder("property", "invoice");
    }

    @Test
    @DisplayName("once the desk closes it, the next message opens a fresh thread")
    void closedThreadIsNotResumed() throws Exception {
        User owner = customer("9840100002");
        User desk = staff("9840100003", Teams.RENTAL);
        String pid = listing(owner).getId().toString();
        String first = field(raise(owner, "property", pid).andReturn().getResponse().getContentAsString(), "id");
        mvc.perform(post(Routes.SupportTickets.CLOSE, first).header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isOk());

        raise(owner, "property", pid)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.not(first)))
                .andExpect(jsonPath("$.messages", hasSize(1)));
    }

    @Test
    @DisplayName("anyone may ask about a live listing; only the owner about one that is not live")
    void propertyScope() throws Exception {
        User owner = customer("9840100004");
        User buyer = customer("9840100005");
        String live = listing(owner).getId().toString();
        String pending = listing(owner).getId().toString();
        jdbc.update("update properties set status = 'pending' where id = ?::uuid", pending);

        raise(buyer, "property", live).andExpect(status().isCreated());
        raise(buyer, "property", pending).andExpect(status().isNotFound());
        raise(owner, "property", pending).andExpect(status().isCreated());
        raise(buyer, "property", "not-a-uuid").andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("flatmate posts and invoices must be the caller's own")
    void ownedSubjects() throws Exception {
        User asha = customer("9840100006");
        User other = customer("9840100007");
        String random = UUID.randomUUID().toString();
        raise(asha, "flatmate_room", random).andExpect(status().isNotFound());
        raise(asha, "flatmate_group", random).andExpect(status().isNotFound());
        raise(asha, "flatmate_post", random).andExpect(status().isNotFound());

        jdbc.update("insert into invoices (number, user_id, source_type, source_id, amount, taxable_amount, issued_at)"
                + " values ('DZ/26-27/000901', ?::uuid, 'subscription', ?::uuid, 499, 423, now())",
                asha.getId().toString(), random);
        raise(other, "invoice", "DZ/26-27/000901").andExpect(status().isNotFound());
        raise(asha, "invoice", "DZ/26-27/000901")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.about.id").value("DZ/26-27/000901"));
    }

    @Test
    @DisplayName("an unknown subject type is refused; the desk queue shows the subject")
    void validationAndQueue() throws Exception {
        User owner = customer("9840100008");
        User desk = staff("9840100009", Teams.RENTAL);
        String pid = listing(owner).getId().toString();
        raise(owner, "deal", pid).andExpect(status().isUnprocessableContent());

        String id = field(raise(owner, "property", pid).andReturn().getResponse().getContentAsString(), "id");
        mvc.perform(get(Routes.Admin.SUPPORT_TICKETS).header(HttpHeaders.AUTHORIZATION, bearer(desk))
                        .param("size", "100"))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].about.type").value("property"));
    }

    private ResultActions raise(User caller, String type, String id) throws Exception {
        return mvc.perform(post(Routes.SupportTickets.BASE)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"subject\":\"About my listing\",\"category\":\"listing\",\"body\":\"Please help\","
                        + "\"about\":{\"type\":\"" + type + "\",\"id\":\"" + id + "\"}}"));
    }
}

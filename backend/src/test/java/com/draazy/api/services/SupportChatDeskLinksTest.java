package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Support chat — desk links: locate a subject's customer and raise a service ticket from a chat")
class SupportChatDeskLinksTest extends ServiceFixtures {

    @Test
    @DisplayName("locate finds the owner of a property, a request and a flatmate post, with the message count")
    void locatesOwners() throws Exception {
        User support = staff("9850300001", Teams.RENTAL);
        User owner = customer("9850300002");
        String pid = listing(owner).getId().toString();
        String request = raise(owner, "rent-agreement", listing(owner));
        String postId = jdbc.queryForObject("insert into flatmate_seeker_posts (user_id, name, budget, mod_status) "
                + "values (?::uuid, 'Sana', 12000, 'live') returning id::text", String.class,
                owner.getId().toString());
        say(owner, "property", pid, "one").andExpect(status().isCreated());
        say(owner, "property", pid, "two").andExpect(status().isCreated());
        say(owner, "request", request, "three").andExpect(status().isCreated());
        say(owner, "general", null, "not about a subject").andExpect(status().isCreated());

        locate(support, "property", pid).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(owner.getId().toString()))
                .andExpect(jsonPath("$.name").value("Asha Patil"))
                .andExpect(jsonPath("$.count").value(2));
        locate(support, "request", request).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(owner.getId().toString()))
                .andExpect(jsonPath("$.count").value(1));
        locate(support, "flatmate_post", postId).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(owner.getId().toString()))
                .andExpect(jsonPath("$.count").value(0));
    }

    @Test
    @DisplayName("a listing moderator can locate a property but not a request")
    void moderatorScope() throws Exception {
        User mod = scoped("9850300003", "listingModeration");
        User owner = customer("9850300004");
        String pid = listing(owner).getId().toString();
        String request = raise(owner, "rent-agreement", listing(owner));

        locate(mod, "property", pid).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(owner.getId().toString()));
        locate(mod, "request", request).andExpect(status().isForbidden());
        locate(mod, "flatmate_post", UUID.randomUUID().toString()).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a service desk can locate only requests on its own team")
    void deskScope() throws Exception {
        User rental = scoped("9850300005", "desk:rental");
        User owner = customer("9850300006");
        String rentalRequest = raise(owner, "rent-agreement", listing(owner));
        String legalRequest = raise(owner, "legal", listing(owner));

        locate(rental, "request", rentalRequest).andExpect(status().isOk());
        locate(rental, "request", legalRequest).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("an owner who has not set a name is still located")
    void unnamedOwner() throws Exception {
        User support = staff("9850300013", Teams.RENTAL);
        User owner = customer("9850300014");
        jdbc.update("update users set name = null where id = ?::uuid", owner.getId().toString());
        String pid = listing(owner).getId().toString();

        locate(support, "property", pid).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(owner.getId().toString()))
                .andExpect(jsonPath("$.name").doesNotExist());
    }

    @Test
    @DisplayName("an unknown id is 404, a malformed one is 404, an unknown type is 400")
    void rejectsBadInput() throws Exception {
        User support = staff("9850300007", Teams.RENTAL);

        locate(support, "property", UUID.randomUUID().toString()).andExpect(status().isNotFound());
        locate(support, "property", "not-a-uuid").andExpect(status().isNotFound());
        locate(support, "invoice", "DZ/26-27/999999").andExpect(status().isNotFound());
        locate(support, "banana", UUID.randomUUID().toString()).andExpect(status().isBadRequest());
        locate(customer("9850300008"), "property", UUID.randomUUID().toString()).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("locate resolves an invoice number to its customer")
    void locatesInvoice() throws Exception {
        User support = staff("9850300009", Teams.RENTAL);
        User owner = customer("9850300010");
        jdbc.update("insert into invoices (number, user_id, source_type, source_id, amount, taxable_amount, issued_at)"
                + " values ('DZ/26-27/000777', ?::uuid, 'subscription', ?::uuid, 499, 423, now())",
                owner.getId().toString(), UUID.randomUUID().toString());
        say(owner, "invoice", "DZ/26-27/000777", "about my invoice").andExpect(status().isCreated());

        locate(support, "invoice", "DZ/26-27/000777").andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(owner.getId().toString()))
                .andExpect(jsonPath("$.count").value(1));
    }

    @Test
    @DisplayName("a service ticket from a chat is the customer's, on the chosen team, and never reaches their chat")
    void createsServiceTicket() throws Exception {
        User support = staff("9850300011", Teams.RENTAL);
        User owner = customer("9850300012");
        String pid = listing(owner).getId().toString();
        say(owner, "general", null, "hello").andExpect(status().isCreated());

        String json = serviceTicket(support, owner.getId(), "legal", "Draft a sale deed", "Owner asked on chat", pid)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.team").value("legal"))
                .andReturn().getResponse().getContentAsString();
        String id = field(json, "id");

        var row = jdbc.queryForMap("select requester_id::text as requester, team, customer, mobile, property_id::text "
                + "as property, detail from tickets where id = ?::uuid", id);
        assertThat(row).containsEntry("requester", owner.getId().toString()).containsEntry("team", "legal")
                .containsEntry("customer", "Asha Patil").containsEntry("mobile", owner.getMobile())
                .containsEntry("property", pid).containsEntry("detail", "Owner asked on chat");
        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages", hasSize(1)));
    }

    @Test
    @DisplayName("a scoped moderator cannot raise a service ticket; bad team, subject and customer are refused")
    void refusesServiceTicket() throws Exception {
        User mod = scoped("9850300013", "listingModeration");
        User support = staff("9850300014", Teams.RENTAL);
        User owner = customer("9850300015");

        serviceTicket(mod, owner.getId(), "legal", "Nope", null, null).andExpect(status().isForbidden());
        serviceTicket(support, owner.getId(), "astrology", "Bad team", null, null).andExpect(status().isBadRequest());
        serviceTicket(support, owner.getId(), "legal", " ", null, null).andExpect(status().isUnprocessableEntity());
        serviceTicket(support, UUID.randomUUID(), "legal", "Ghost", null, null).andExpect(status().isNotFound());
        serviceTicket(support, support.getId(), "legal", "Staff", null, null).andExpect(status().isBadRequest());
        serviceTicket(support, owner.getId(), "legal", "Missing property", null, UUID.randomUUID().toString())
                .andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from tickets where requester_id = ?::uuid", Long.class,
                owner.getId().toString())).isZero();
    }

    private User scoped(String mobile, String... functions) {
        User u = user(mobile, Roles.Wire.STAFF, Teams.RENTAL, "Scoped Desk");
        String json = "[" + String.join(",", java.util.Arrays.stream(functions).map(f -> "\"" + f + "\"").toList()) + "]";
        jdbc.update("update back_office_permissions set permissions = ?::jsonb where user_id = ?::uuid", json,
                u.getId().toString());
        return u;
    }

    private ResultActions say(User caller, String type, String id, String text) throws Exception {
        String about = id == null ? "{\"type\":\"" + type + "\"}" : "{\"type\":\"" + type + "\",\"id\":\"" + id + "\"}";
        return mvc.perform(post(Routes.SupportChat.MESSAGES)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"text\":\"" + text + "\",\"about\":" + about + "}"));
    }

    private ResultActions locate(User caller, String type, String id) throws Exception {
        return mvc.perform(get(Routes.Admin.SUPPORT_CHATS_LOCATE).param("type", type).param("id", id)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private ResultActions serviceTicket(User caller, UUID customer, String team, String subject, String note,
            String propertyId) throws Exception {
        String body = "{\"team\":\"" + team + "\",\"subject\":\"" + subject + "\""
                + (note == null ? "" : ",\"note\":\"" + note + "\"")
                + (propertyId == null ? "" : ",\"propertyId\":\"" + propertyId + "\"") + "}";
        return mvc.perform(post(Routes.Admin.SUPPORT_CHAT_SERVICE_TICKET, customer)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }
}

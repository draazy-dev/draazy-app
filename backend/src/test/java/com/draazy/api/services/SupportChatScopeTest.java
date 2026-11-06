package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Support chat — staff see only the contexts their back-office functions cover")
class SupportChatScopeTest extends ServiceFixtures {

    @Test
    @DisplayName("a listing moderator sees only property chats and only property messages")
    void moderatorSeesProperty() throws Exception {
        User mod = scoped("9850200001", "listingModeration");
        User generalOnly = customer("9850200002");
        User both = customer("9850200003");
        String pid = listing(both).getId().toString();
        say(generalOnly, "general", null, "just a question").andExpect(status().isCreated());
        say(both, "general", null, "general words").andExpect(status().isCreated());
        say(both, "property", pid, "property words").andExpect(status().isCreated());

        inbox(mod, "all", null)
                .andExpect(jsonPath("$.content[?(@.userId=='" + both.getId() + "')]", hasSize(1)))
                .andExpect(jsonPath("$.content[?(@.userId=='" + both.getId() + "')].lastAbout.type")
                        .value(contains("property")))
                .andExpect(jsonPath("$.content[?(@.userId=='" + generalOnly.getId() + "')]", hasSize(0)));
        inbox(mod, "all", "general")
                .andExpect(jsonPath("$.content[?(@.userId=='" + both.getId() + "')]", hasSize(0)));
        fetch(mod, Routes.Admin.SUPPORT_CHAT, both.getId()).andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[*].text").value(contains("property words")));
        fetch(mod, Routes.Admin.SUPPORT_CHAT, generalOnly.getId()).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a moderator cannot send in general, assign or resolve, but can answer the property topic")
    void moderatorWrites() throws Exception {
        User mod = scoped("9850200004", "listingModeration");
        User owner = customer("9850200005");
        String pid = listing(owner).getId().toString();
        say(owner, "general", null, "hello").andExpect(status().isCreated());
        say(owner, "property", pid, "about my listing").andExpect(status().isCreated());

        send(mod, owner.getId(), "general", null, "nope").andExpect(status().isForbidden());
        send(mod, owner.getId(), null, null, "nope").andExpect(status().isForbidden());
        send(mod, owner.getId(), "request", UUID.randomUUID().toString(), "nope").andExpect(status().isForbidden());
        act(mod, Routes.Admin.SUPPORT_CHAT_ASSIGN, owner.getId()).andExpect(status().isForbidden());
        act(mod, Routes.Admin.SUPPORT_CHAT_RESOLVE, owner.getId()).andExpect(status().isForbidden());
        send(mod, owner.getId(), "property", pid, "looking into it").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a desk reply on one topic leaves the conversation awaiting while another topic still waits")
    void conversationStaysAwaiting() throws Exception {
        User support = staff("9850200006", Teams.RENTAL);
        User mod = scoped("9850200007", "listingModeration");
        User owner = customer("9850200008");
        String pid = listing(owner).getId().toString();
        Counts before = counts(support);

        say(owner, "general", null, "general question").andExpect(status().isCreated());
        say(owner, "property", pid, "property question").andExpect(status().isCreated());
        send(mod, owner.getId(), "property", pid, "property answer").andExpect(status().isCreated());

        assertThat(conversationStatus(owner)).isEqualTo("awaiting");
        assertThat(count("select count(*) from support_conversations where user_id = ?::uuid "
                + "and assignee_id is not null", owner.getId().toString())).as("a desk reply claims nothing").isZero();
        assertThat(counts(support).awaiting() - before.awaiting()).isEqualTo(1);
        inbox(mod, "all", null)
                .andExpect(jsonPath("$.content[?(@.userId=='" + owner.getId() + "')].status").value(contains("answered")));
        inbox(mod, "awaiting", null)
                .andExpect(jsonPath("$.content[?(@.userId=='" + owner.getId() + "')]", hasSize(0)));
        inbox(support, "awaiting", null)
                .andExpect(jsonPath("$.content[?(@.userId=='" + owner.getId() + "')]", hasSize(1)));

        send(support, owner.getId(), "general", null, "general answer").andExpect(status().isCreated());
        assertThat(conversationStatus(owner)).isEqualTo("answered");
        assertThat(count("select count(*) from support_conversation_topics where user_id = ?::uuid "
                + "and status = 'awaiting'", owner.getId().toString())).isZero();
    }

    @Test
    @DisplayName("resolving closes every topic; a later user message reopens only its own topic")
    void resolveClosesTopics() throws Exception {
        User support = staff("9850200009", Teams.RENTAL);
        User owner = customer("9850200010");
        String pid = listing(owner).getId().toString();
        say(owner, "general", null, "one").andExpect(status().isCreated());
        say(owner, "property", pid, "two").andExpect(status().isCreated());

        act(support, Routes.Admin.SUPPORT_CHAT_RESOLVE, owner.getId()).andExpect(status().isNoContent());
        assertThat(conversationStatus(owner)).isEqualTo("resolved");
        assertThat(count("select count(*) from support_conversation_topics where user_id = ?::uuid "
                + "and (status = 'awaiting' or staff_unread)", owner.getId().toString())).isZero();

        say(owner, "general", null, "three").andExpect(status().isCreated());
        assertThat(conversationStatus(owner)).isEqualTo("awaiting");
        assertThat(count("select count(*) from support_conversation_topics where user_id = ?::uuid "
                + "and status = 'awaiting'", owner.getId().toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("reading clears only the topics in the reader's scope")
    void readStaysInScope() throws Exception {
        User mod = scoped("9850200011", "listingModeration");
        User owner = customer("9850200012");
        String pid = listing(owner).getId().toString();
        say(owner, "general", null, "general").andExpect(status().isCreated());
        say(owner, "property", pid, "property").andExpect(status().isCreated());

        act(mod, Routes.Admin.SUPPORT_CHAT_READ, owner.getId()).andExpect(status().isNoContent());

        assertThat(topicUnread(owner, "property")).isFalse();
        assertThat(topicUnread(owner, "general")).isTrue();
        assertThat(jdbc.queryForObject("select staff_unread from support_conversations where user_id = ?::uuid",
                Boolean.class, owner.getId().toString())).isTrue();
    }

    @Test
    @DisplayName("a service desk sees its own team's request topics and nobody else's")
    void deskSeesOwnTeam() throws Exception {
        User rental = scoped("9850200013", "desk:rental");
        User rentalCustomer = customer("9850200014");
        User legalCustomer = customer("9850200015");
        String rentalRequest = raise(rentalCustomer, "rent-agreement", listing(rentalCustomer));
        String legalRequest = raise(legalCustomer, "legal", listing(legalCustomer));
        say(rentalCustomer, "request", rentalRequest, "rental question").andExpect(status().isCreated());
        say(legalCustomer, "request", legalRequest, "legal question").andExpect(status().isCreated());

        inbox(rental, "all", null)
                .andExpect(jsonPath("$.content[?(@.userId=='" + rentalCustomer.getId() + "')]", hasSize(1)))
                .andExpect(jsonPath("$.content[?(@.userId=='" + legalCustomer.getId() + "')]", hasSize(0)));
        fetch(rental, Routes.Admin.SUPPORT_CHAT, rentalCustomer.getId()).andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[*].text").value(contains("rental question")))
                .andExpect(jsonPath("$.cases[*].id").value(contains(rentalRequest)));
        fetch(rental, Routes.Admin.SUPPORT_CHAT, legalCustomer.getId()).andExpect(status().isNotFound());
        send(rental, legalCustomer.getId(), "request", legalRequest, "not mine").andExpect(status().isForbidden());
        send(rental, rentalCustomer.getId(), "request", rentalRequest, "on it").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("Loans-only staff no longer see general chats, and counts carry their scope")
    void loansSeesNoGeneral() throws Exception {
        User loans = scoped("9850200016", "desk:loans");
        User owner = customer("9850200017");
        say(owner, "general", null, "hello").andExpect(status().isCreated());

        inbox(loans, "all", null).andExpect(jsonPath("$.content[?(@.userId=='" + owner.getId() + "')]", hasSize(0)));
        fetch(loans, Routes.Admin.SUPPORT_CHAT, owner.getId()).andExpect(status().isNotFound());
        send(loans, owner.getId(), "general", null, "hi").andExpect(status().isForbidden());
        mvc.perform(get(Routes.Admin.SUPPORT_CHATS_COUNTS).header(HttpHeaders.AUTHORIZATION, bearer(loans)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mine").value(0))
                .andExpect(jsonPath("$.scope.full").value(false))
                .andExpect(jsonPath("$.scope.contexts").value(contains("request")));
    }

    @Test
    @DisplayName("support, managers and admins are full scope")
    void fullScope() throws Exception {
        User support = staff("9850200018", Teams.RENTAL);
        for (User caller : new User[] {support, manager("9850200019"), admin("9850200020")}) {
            mvc.perform(get(Routes.Admin.SUPPORT_CHATS_COUNTS).header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.scope.full").value(true))
                    .andExpect(jsonPath("$.scope.contexts").value(containsInAnyOrder(
                            "general", "property", "flatmate", "request", "identity", "invoice")));
        }
    }

    @Test
    @DisplayName("the KYC, flatmates and refunds functions map to identity, flatmate and invoice chats")
    void otherFunctions() throws Exception {
        User caller = scoped("9850200021", "kyc", "flatmates", "refunds");
        mvc.perform(get(Routes.Admin.SUPPORT_CHATS_COUNTS).header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.scope.full").value(false))
                .andExpect(jsonPath("$.scope.contexts").value(containsInAnyOrder("flatmate", "identity", "invoice")));
    }

    @Test
    @DisplayName("the topic backfill builds one row per context and lifts the conversation to awaiting")
    void topicBackfill() throws Exception {
        User user = customer("9850200022");
        User desk = staff("9850200023", Teams.RENTAL);
        String uid = user.getId().toString();
        String request = raise(user, "rent-agreement", listing(user));
        jdbc.update("delete from support_conversation_topics");
        jdbc.update("delete from support_conversations");
        String ticket = jdbc.queryForObject("insert into support_tickets (user_id, subject, category, status, "
                + "staff_unread) values (?::uuid, 'Help', 'other', 'open', true) returning id::text", String.class, uid);
        jdbc.update("insert into support_ticket_messages (ticket_id, author_id, author_role, body, created_at) "
                + "values (?::uuid, ?::uuid, 'buyer', 'general question', '2026-01-01T10:00:00Z')", ticket, uid);
        jdbc.update("insert into service_request_messages (id, request_id, author_id, author_role, body, created_at) "
                + "values (gen_random_uuid(), ?::uuid, ?::uuid, 'staff', 'staff on the request', "
                + "'2026-01-03T10:00:00Z')", request, desk.getId().toString());
        jdbc.update("insert into support_conversations (user_id, status, last_at) values (?::uuid, 'answered', now())",
                uid);

        String sql = new String(new ClassPathResource(
                "db/migration/26.11.37__DDL_support_conversation_topics.sql").getContentAsByteArray(),
                StandardCharsets.UTF_8);
        jdbc.execute(sql.substring(sql.indexOf("INSERT INTO support_conversation_topics")));

        assertThat(jdbc.queryForMap("select status, staff_unread, last_from from support_conversation_topics "
                + "where user_id = ?::uuid and about_type = 'general' and about_id = ''", uid))
                .containsEntry("status", "awaiting").containsEntry("staff_unread", true)
                .containsEntry("last_from", "user");
        assertThat(jdbc.queryForMap("select status, staff_unread, last_from from support_conversation_topics "
                + "where user_id = ?::uuid and about_type = 'request' and about_id = ?", uid, request))
                .containsEntry("status", "answered").containsEntry("staff_unread", false)
                .containsEntry("last_from", "staff");
        assertThat(conversationStatus(user)).isEqualTo("awaiting");
    }

    private User scoped(String mobile, String... functions) {
        User u = user(mobile, Roles.Wire.STAFF, Teams.RENTAL, "Scoped Desk");
        String json = "[" + String.join(",", java.util.Arrays.stream(functions).map(f -> "\"" + f + "\"").toList()) + "]";
        jdbc.update("update back_office_permissions set permissions = ?::jsonb where user_id = ?::uuid", json,
                u.getId().toString());
        return u;
    }

    private String conversationStatus(User user) {
        return jdbc.queryForObject("select status from support_conversations where user_id = ?::uuid", String.class,
                user.getId().toString());
    }

    private boolean topicUnread(User user, String type) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select staff_unread from support_conversation_topics "
                + "where user_id = ?::uuid and about_type = ?", Boolean.class, user.getId().toString(), type));
    }

    private long count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    private ResultActions say(User caller, String type, String id, String text) throws Exception {
        return mvc.perform(post(Routes.SupportChat.MESSAGES)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload(text, type, id)));
    }

    private ResultActions send(User desk, UUID userId, String type, String id, String text) throws Exception {
        return mvc.perform(post(Routes.Admin.SUPPORT_CHAT_MESSAGES, userId)
                .header(HttpHeaders.AUTHORIZATION, bearer(desk))
                .contentType(MediaType.APPLICATION_JSON)
                .content(payload(text, type, id)));
    }

    private static String payload(String text, String type, String id) {
        String about = type == null ? "null"
                : "{\"type\":\"" + type + "\"" + (id == null ? "" : ",\"id\":\"" + id + "\"") + "}";
        return "{\"text\":\"" + text + "\",\"about\":" + about + "}";
    }

    private ResultActions fetch(User caller, String route, UUID userId) throws Exception {
        return mvc.perform(get(route, userId).header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private ResultActions act(User caller, String route, UUID userId) throws Exception {
        return mvc.perform(post(route, userId).header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private ResultActions inbox(User desk, String view, String context) throws Exception {
        var builder = get(Routes.Admin.SUPPORT_CHATS).header(HttpHeaders.AUTHORIZATION, bearer(desk))
                .param("view", view).param("size", "200");
        if (context != null) {
            builder.param("context", context);
        }
        return mvc.perform(builder);
    }

    private record Counts(long awaiting, long mine, long all) {
    }

    private Counts counts(User desk) throws Exception {
        String json = mvc.perform(get(Routes.Admin.SUPPORT_CHATS_COUNTS).header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return new Counts(number(json, "awaiting"), number(json, "mine"), number(json, "all"));
    }

    private static long number(String json, String name) {
        return Long.parseLong(json.replaceAll(".*\"" + name + "\"\\s*:\\s*(\\d+).*", "$1"));
    }
}

package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@DisplayName("Support chat — one conversation per user, staff inbox on top")
class SupportChatEndpointsTest extends ServiceFixtures {

    @Test
    @DisplayName("the timeline merges ticket, review and service-request messages in order, with labels")
    void timelineMerges() throws Exception {
        User owner = customer("9850100001");
        Property property = listing(owner);
        String pid = property.getId().toString();
        openReview(pid, "pending");
        String request = raise(owner, "rent-agreement", property);
        jdbc.update("insert into review_messages (review_id, sender_id, body, internal) "
                + "select id, ?::uuid, 'staff-only note', true from property_reviews where property_id = ?::uuid",
                owner.getId().toString(), pid);

        say(owner, "general", null, "hello desk").andExpect(status().isCreated())
                .andExpect(jsonPath("$.from").value("me"))
                .andExpect(jsonPath("$.about.type").value("general"));
        say(owner, "property", pid, "about my review").andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.startsWith("r:")));
        say(owner, "request", request, "about my request").andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.startsWith("s:")));

        String title = jdbc.queryForObject("select title from properties where id = ?::uuid", String.class, pid);
        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("awaiting"))
                .andExpect(jsonPath("$.unread").value(0))
                .andExpect(jsonPath("$.messages[*].text").value(contains(
                        "hello desk", "about my review", "about my request")))
                .andExpect(jsonPath("$.messages[0].id").value(org.hamcrest.Matchers.startsWith("t:")))
                .andExpect(jsonPath("$.messages[0].from").value("me"))
                .andExpect(jsonPath("$.messages[1].about.type").value("property"))
                .andExpect(jsonPath("$.messages[1].about.id").value(pid))
                .andExpect(jsonPath("$.messages[1].about.label").value(title))
                .andExpect(jsonPath("$.messages[2].about.type").value("request"))
                .andExpect(jsonPath("$.messages[2].about.id").value(request))
                .andExpect(jsonPath("$.messages[2].about.label")
                        .value(org.hamcrest.Matchers.endsWith("#" + request.substring(0, 6))))
                .andExpect(jsonPath("$.cases[?(@.type=='property')].replyable").value(contains(true)))
                .andExpect(jsonPath("$.cases[?(@.type=='request')].id").value(contains(request)));
    }

    @Test
    @DisplayName("a closed service request refuses the message; an unknown context is a 400")
    void requestClosedAndValidation() throws Exception {
        User owner = customer("9850100002");
        String request = raise(owner, "rent-agreement", listing(owner));
        jdbc.update("update service_requests set status = 'cancelled' where id = ?::uuid", request);

        say(owner, "request", request, "still there?").andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("request_closed"));
        say(owner, "request", UUID.randomUUID().toString(), "nope").andExpect(status().isNotFound());
        say(owner, "deal", "x", "what").andExpect(status().isBadRequest());
        say(owner, "property", null, "no id").andExpect(status().isBadRequest());
        mvc.perform(post(Routes.SupportChat.MESSAGES).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"text\":\"  \"}"))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(post(Routes.SupportChat.MESSAGES).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"hi\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a property with an open review writes into the review; otherwise into the chat ticket")
    void propertyRouting() throws Exception {
        User owner = customer("9850100003");
        String open = listing(owner).getId().toString();
        String settled = listing(owner).getId().toString();
        openReview(open, "needs_info");
        openReview(settled, "approved");

        say(owner, "property", open, "here is the info").andExpect(status().isCreated());
        assertThat(count("select count(*) from review_messages rm join property_reviews pr on pr.id = rm.review_id "
                + "where pr.property_id = ?::uuid and rm.sender_id = ?::uuid", open, owner.getId().toString()))
                .isEqualTo(1);
        assertThat(count("select count(*) from support_tickets where user_id = ?::uuid",
                owner.getId().toString())).isZero();

        say(owner, "property", settled, "a question about this one").andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.startsWith("t:")))
                .andExpect(jsonPath("$.about.type").value("property"))
                .andExpect(jsonPath("$.about.id").value(settled));
        assertThat(count("select count(*) from support_tickets where user_id = ?::uuid",
                owner.getId().toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("a flatmate post under review replies on its case; one that is live goes to the chat ticket")
    void flatmateRouting() throws Exception {
        User host = customer("9850100004");
        User liveHost = customer("9850100026");
        String inReview = flatmatePost(host, "pending");
        String live = flatmatePost(liveHost, "approved");

        say(host, "flatmate_post", inReview, "added the photos").andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.startsWith("r:")))
                .andExpect(jsonPath("$.about.type").value("flatmate_post"));
        assertThat(count("select count(*) from support_tickets where user_id = ?::uuid",
                host.getId().toString())).isZero();

        say(liveHost, "flatmate_post", live, "how do I edit it?").andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.startsWith("t:")))
                .andExpect(jsonPath("$.about.id").value(live));
        say(host, "flatmate_post", UUID.randomUUID().toString(), "not mine").andExpect(status().isNotFound());

        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(host)))
                .andExpect(jsonPath("$.cases[?(@.type=='flatmate_post')].id").value(contains(inReview)));
    }

    @Test
    @DisplayName("identity tickets stay their own thread and reply there; a closed one is refused")
    void identityRouting() throws Exception {
        User user = customer("9850100005");
        String ticket = identityTicket(user, "open");
        String settled = identityTicket(user, "closed");

        say(user, "identity", ticket, "here is my proof").andExpect(status().isCreated())
                .andExpect(jsonPath("$.about.type").value("identity"))
                .andExpect(jsonPath("$.about.id").value(ticket))
                .andExpect(jsonPath("$.about.label").value("Identity dispute"));
        assertThat(count("select count(*) from support_ticket_messages where ticket_id = ?::uuid", ticket))
                .isEqualTo(2);
        say(user, "identity", settled, "one more thing").andExpect(status().isConflict());
        say(user, "identity", identityTicket(customer("9850100006"), "open"), "not mine")
                .andExpect(status().isNotFound());

        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(jsonPath("$.cases[?(@.type=='identity')].id").value(contains(ticket)));
    }

    @Test
    @DisplayName("general and invoice questions share one ticket; a resolved chat reopens it, never a second")
    void oneTicketForever() throws Exception {
        User user = customer("9850100007");
        User desk = staff("9850100008", Teams.RENTAL);
        jdbc.update("insert into invoices (number, user_id, source_type, source_id, amount, taxable_amount, issued_at)"
                + " values ('DZ/26-27/000911', ?::uuid, 'subscription', ?::uuid, 499, 423, now())",
                user.getId().toString(), UUID.randomUUID().toString());

        say(user, "general", null, "first").andExpect(status().isCreated());
        say(user, "invoice", "DZ/26-27/000911", "about my invoice").andExpect(status().isCreated())
                .andExpect(jsonPath("$.about.label").value("DZ/26-27/000911"));
        act(desk, Routes.Admin.SUPPORT_CHAT_RESOLVE, user.getId()).andExpect(status().isNoContent());
        em.clear();

        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(jsonPath("$.status").value("resolved"));
        say(user, "general", null, "it came back").andExpect(status().isCreated());

        assertThat(count("select count(*) from support_tickets where user_id = ?::uuid",
                user.getId().toString())).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from support_tickets where user_id = ?::uuid",
                String.class, user.getId())).isEqualTo("open");
        assertThat(jdbc.queryForObject("select status from support_conversations where user_id = ?::uuid",
                String.class, user.getId().toString())).isEqualTo("awaiting");
        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(jsonPath("$.messages", hasSize(3)));
    }

    @Test
    @DisplayName("a staff reply claims the chat, flips it to answered and raises the user's unread")
    void staffReplyClaims() throws Exception {
        User user = customer("9850100009");
        User desk = staff("9850100010", Teams.RENTAL);
        String uid = user.getId().toString();
        say(user, "general", null, "x".repeat(300)).andExpect(status().isCreated());

        fetch(desk, Routes.Admin.SUPPORT_CHAT, user.getId()).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("awaiting"))
                .andExpect(jsonPath("$.assignee").value(nullValue()))
                .andExpect(jsonPath("$.user.name").value("Asha Patil"))
                .andExpect(jsonPath("$.user.mobile")                .value("98XXXXX009"))
                .andExpect(jsonPath("$.messages[0].from").value("user"));
        assertThat(jdbc.queryForObject("select staff_unread from support_conversations where user_id = ?::uuid",
                Boolean.class, uid)).isTrue();
        assertThat(jdbc.queryForObject("select length(last_preview) from support_conversations "
                + "where user_id = ?::uuid", Integer.class, uid)).isLessThanOrEqualTo(141);

        send(desk, user.getId(), "general", null, "We are on it").andExpect(status().isCreated())
                .andExpect(jsonPath("$.from").value("staff"))
                .andExpect(jsonPath("$.staffName").value("Rohit Desk"));

        fetch(desk, Routes.Admin.SUPPORT_CHAT, user.getId())
                .andExpect(jsonPath("$.status").value("answered"))
                .andExpect(jsonPath("$.assignee.id").value(desk.getId().toString()));
        assertThat(jdbc.queryForObject("select user_unread from support_conversations where user_id = ?::uuid",
                Boolean.class, uid)).isTrue();

        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(jsonPath("$.status").value("answered"))
                .andExpect(jsonPath("$.unread").value(1))
                .andExpect(jsonPath("$.assignee.name").value("Rohit Desk"))
                .andExpect(jsonPath("$.messages[1].from").value("staff"))
                .andExpect(jsonPath("$.messages[1].staffName").value("Rohit Desk"));
        mvc.perform(post(Routes.SupportChat.READ).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isNoContent());
        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(jsonPath("$.unread").value(0));
    }

    @Test
    @DisplayName("staff replies on a service request reach the requester's chat and flip the inbox")
    void staffRepliesOnRequest() throws Exception {
        User user = customer("9850100011");
        User desk = staff("9850100012", Teams.RENTAL);
        String request = raise(user, "rent-agreement", listing(user));

        send(desk, user.getId(), "request", request, "Please upload the PAN").andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(org.hamcrest.Matchers.startsWith("s:")))
                .andExpect(jsonPath("$.from").value("staff"));
        mvc.perform(get(Routes.SupportChat.BASE).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(jsonPath("$.status").value("answered"))
                .andExpect(jsonPath("$.unread").value(1));
        mvc.perform(post(Routes.SupportChat.READ).header(HttpHeaders.AUTHORIZATION, bearer(user)))
                .andExpect(status().isNoContent());
        assertThat(count("select count(*) from service_request_messages where request_id = ?::uuid "
                + "and read_at is null and author_role in ('staff','manager','admin')", request)).isZero();
    }

    @Test
    @DisplayName("views, counts and context filters; taking over moves the chat into the new owner's Mine")
    void inboxViewsCountsAndTakeOver() throws Exception {
        User first = staff("9850100013", Teams.RENTAL);
        User second = staff("9850100014", Teams.RENTAL);
        User a = customer("9850100015");
        User b = customer("9850100016");
        User c = customer("9850100017");
        String pid = listing(b).getId().toString();
        String request = raise(c, "rent-agreement", listing(c));

        Counts before = counts(first);
        say(a, "general", null, "question A").andExpect(status().isCreated());
        say(b, "property", pid, "question B").andExpect(status().isCreated());
        say(c, "request", request, "question C").andExpect(status().isCreated());
        send(first, a.getId(), "general", null, "answering A").andExpect(status().isCreated());

        Counts after = counts(first);
        assertThat(after.awaiting() - before.awaiting()).isEqualTo(2);
        assertThat(after.all() - before.all()).isEqualTo(3);
        assertThat(after.mine() - before.mine()).isEqualTo(1);

        inbox(first, "awaiting", null).andExpect(jsonPath("$.content[?(@.userId=='" + b.getId() + "')]", hasSize(1)))
                .andExpect(jsonPath("$.content[?(@.userId=='" + a.getId() + "')]", hasSize(0)));
        inbox(first, "mine", null).andExpect(jsonPath("$.content[?(@.userId=='" + a.getId() + "')]", hasSize(1)))
                .andExpect(jsonPath("$.content[?(@.userId=='" + a.getId() + "')].assignee.name").value(contains("Rohit Desk")))
                .andExpect(jsonPath("$.content[?(@.userId=='" + a.getId() + "')].lastFrom").value(contains("staff")));
        inbox(second, "mine", null).andExpect(jsonPath("$.content[?(@.userId=='" + a.getId() + "')]", hasSize(0)));
        inbox(first, "all", "property").andExpect(jsonPath("$.content[?(@.userId=='" + b.getId() + "')].lastAbout.type")
                        .value(contains("property")))
                .andExpect(jsonPath("$.content[?(@.userId=='" + c.getId() + "')]", hasSize(0)));
        inbox(first, "all", "request").andExpect(jsonPath("$.content[?(@.userId=='" + c.getId() + "')]", hasSize(1)))
                .andExpect(jsonPath("$.content[?(@.userId=='" + b.getId() + "')]", hasSize(0)));
        inbox(first, "all", "general").andExpect(jsonPath("$.content[?(@.userId=='" + a.getId() + "')]", hasSize(1)));

        mvc.perform(post(Routes.Admin.SUPPORT_CHAT_ASSIGN, a.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(second))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"assigneeId\":null}"))
                .andExpect(status().isNoContent());
        inbox(second, "mine", null).andExpect(jsonPath("$.content[?(@.userId=='" + a.getId() + "')]", hasSize(1)));
        inbox(first, "mine", null).andExpect(jsonPath("$.content[?(@.userId=='" + a.getId() + "')]", hasSize(0)));
        mvc.perform(post(Routes.Admin.SUPPORT_CHAT_ASSIGN, a.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(second))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"assigneeId\":\"" + b.getId() + "\"}"))
                .andExpect(status().is4xxClientError());
    }

    @Test
    @DisplayName("staff reading a chat clears its unread flag and every source's unread messages")
    void staffRead() throws Exception {
        User owner = customer("9850100018");
        User desk = staff("9850100019", Teams.RENTAL);
        String pid = listing(owner).getId().toString();
        openReview(pid, "pending");
        say(owner, "general", null, "one").andExpect(status().isCreated());
        say(owner, "property", pid, "two").andExpect(status().isCreated());

        act(desk, Routes.Admin.SUPPORT_CHAT_READ, owner.getId()).andExpect(status().isNoContent());
        act(desk, Routes.Admin.SUPPORT_CHAT_READ, owner.getId()).andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select staff_unread from support_conversations where user_id = ?::uuid",
                Boolean.class, owner.getId().toString())).isFalse();
        assertThat(count("select count(*) from review_messages rm join property_reviews pr on pr.id = rm.review_id "
                + "where pr.property_id = ?::uuid and rm.sender_id = ?::uuid and rm.read_at is null",
                pid, owner.getId().toString())).isZero();
        assertThat(jdbc.queryForObject("select staff_unread from support_tickets where user_id = ?::uuid",
                Boolean.class, owner.getId())).isFalse();
    }

    @Test
    @DisplayName("every admin route refuses a customer, an anonymous caller and staff without Support")
    void permissions() throws Exception {
        User customer = customer("9850100020");
        User blind = user("9850100021", Roles.Wire.STAFF, Teams.RENTAL, "No Support");
        jdbc.update("update back_office_permissions set permissions = '[\"content\"]'::jsonb "
                + "where user_id = ?::uuid", blind.getId().toString());
        UUID target = customer.getId();
        String body = "{\"text\":\"hi\",\"about\":null}";

        List<String> reads = List.of(Routes.Admin.SUPPORT_CHATS, Routes.Admin.SUPPORT_CHATS_COUNTS,
                Routes.Admin.SUPPORT_CHATS_STREAM, Routes.Admin.SUPPORT_CHAT);
        List<String> writes = List.of(Routes.Admin.SUPPORT_CHAT_MESSAGES, Routes.Admin.SUPPORT_CHAT_ASSIGN,
                Routes.Admin.SUPPORT_CHAT_RESOLVE, Routes.Admin.SUPPORT_CHAT_READ);
        for (User caller : new User[] {customer, blind, null}) {
            int expected = caller == null ? 401 : 403;
            for (String route : reads) {
                hit(false, route, target, caller, null).andExpect(status().is(expected));
            }
            for (String route : writes) {
                hit(true, route, target, caller, body).andExpect(status().is(expected));
            }
        }
    }

    @Test
    @DisplayName("the staff stream opens for support staff")
    void streamOpens() throws Exception {
        User desk = staff("9850100022", Teams.RENTAL);
        mvc.perform(get(Routes.Admin.SUPPORT_CHATS_STREAM).header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(request().asyncStarted())
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_EVENT_STREAM));
    }

    @Test
    @DisplayName("the migration backfill merges open tickets into one and builds the conversation index")
    void migrationBackfill() throws Exception {
        User user = customer("9850100023");
        User desk = staff("9850100024", Teams.RENTAL);
        String uid = user.getId().toString();
        Property property = listing(user);
        String request = raise(user, "rent-agreement", property);
        jdbc.update("delete from support_conversations");
        jdbc.execute("drop index uq_support_tickets_open_chat");

        String older = ticketWithMessage(uid, "listing", "open", "older question", user.getId(), "2026-01-01T10:00:00Z");
        String newer = ticketWithMessage(uid, "other", "waiting", "newer question", user.getId(), "2026-01-02T10:00:00Z");
        jdbc.update("insert into service_request_messages (id, request_id, author_id, author_role, body, created_at) "
                + "values (gen_random_uuid(), ?::uuid, ?::uuid, 'staff', 'staff on the request', '2026-01-03T10:00:00Z')",
                request, desk.getId().toString());

        String migration = migration();
        String merge = migration.substring(migration.indexOf("CREATE TEMP TABLE chat_merge"),
                migration.indexOf("DROP INDEX uq_support_tickets_open_about"));
        jdbc.execute(merge);
        jdbc.execute(migration.substring(migration.indexOf("INSERT INTO support_conversations")));

        assertThat(jdbc.queryForObject("select status from support_tickets where id = ?::uuid", String.class, older))
                .isEqualTo("closed");
        assertThat(jdbc.queryForObject("select status from support_tickets where id = ?::uuid", String.class, newer))
                .isEqualTo("waiting");
        assertThat(count("select count(*) from support_ticket_messages where ticket_id = ?::uuid", newer))
                .isEqualTo(2);
        assertThat(jdbc.queryForMap("select status, last_from, last_about_type, last_preview, user_unread "
                + "from support_conversations where user_id = ?::uuid", uid))
                .containsEntry("status", "answered")
                .containsEntry("last_from", "staff")
                .containsEntry("last_about_type", "request")
                .containsEntry("last_preview", "staff on the request")
                .containsEntry("user_unread", true);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("concurrent reads of the chat never conflict")
    void concurrentReadsDoNotConflict() throws Exception {
        User user = customer("9850100025");
        String uid = user.getId().toString();
        UUID ticket = UUID.randomUUID();
        try {
            jdbc.update("insert into support_tickets (id, user_id, subject, category, status, unread) "
                    + "values (?, ?::uuid, 'Support chat', 'other', 'open', true)", ticket, uid);
            jdbc.update("insert into support_ticket_messages (ticket_id, author_role, body) values (?, 'staff', 'hello')",
                    ticket);
            jdbc.update("insert into support_conversations (user_id, status, user_unread, last_at) "
                    + "values (?::uuid, 'answered', true, now())", uid);
            String token = bearer(user);

            ExecutorService pool = Executors.newFixedThreadPool(8);
            try {
                List<Future<Integer>> results = new java.util.ArrayList<>();
                for (int i = 0; i < 16; i++) {
                    results.add(pool.submit(() -> mvc.perform(post(Routes.SupportChat.READ)
                                    .header(HttpHeaders.AUTHORIZATION, token))
                            .andReturn().getResponse().getStatus()));
                }
                for (Future<Integer> result : results) {
                    assertThat(result.get()).isEqualTo(204);
                }
            } finally {
                pool.shutdownNow();
            }
            assertThat(jdbc.queryForObject("select user_unread from support_conversations where user_id = ?::uuid",
                    Boolean.class, uid)).isFalse();
        } finally {
            jdbc.update("delete from support_conversations where user_id = ?::uuid", uid);
            jdbc.update("delete from support_ticket_messages where ticket_id = ?", ticket);
            jdbc.update("delete from support_tickets where id = ?", ticket);
            jdbc.update("delete from users where id = ?::uuid", uid);
        }
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

    private ResultActions hit(boolean write, String route, UUID userId, User caller, String jsonBody)
            throws Exception {
        var builder = write
                ? post(route, userId).contentType(MediaType.APPLICATION_JSON).content(jsonBody)
                : get(route, userId);
        if (caller != null) {
            builder.header(HttpHeaders.AUTHORIZATION, bearer(caller));
        }
        return mvc.perform(builder);
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

    private long count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    private void openReview(String propertyId, String status) {
        jdbc.update("insert into property_reviews (property_id, status, last_message_at) values (?::uuid, ?, now())",
                propertyId, status);
    }

    private String flatmatePost(User host, String modStatus) {
        return jdbc.queryForObject("insert into flatmate_seeker_posts (user_id, name, budget, mod_status) "
                + "values (?::uuid, 'Seeker', 18000, ?) returning id::text", String.class,
                host.getId().toString(), modStatus);
    }

    private String identityTicket(User user, String status) {
        String id = jdbc.queryForObject("insert into support_tickets (user_id, subject, category, status) "
                + "values (?::uuid, 'Identity dispute', 'identity_dispute', ?) returning id::text", String.class,
                user.getId().toString(), status);
        jdbc.update("insert into support_ticket_messages (ticket_id, author_id, author_role, body) "
                + "values (?::uuid, ?::uuid, 'buyer', 'this is not me')", id, user.getId().toString());
        return id;
    }

    private String ticketWithMessage(String userId, String category, String status, String body, UUID author,
            String at) {
        String id = jdbc.queryForObject("insert into support_tickets (user_id, subject, category, status, updated_at) "
                + "values (?::uuid, 'Help', ?, ?, ?::timestamptz) returning id::text", String.class, userId, category,
                status, at);
        jdbc.update("insert into support_ticket_messages (ticket_id, author_id, author_role, body, created_at) "
                + "values (?::uuid, ?::uuid, 'buyer', ?, ?::timestamptz)", id, author.toString(), body, at);
        return id;
    }

    private static String migration() throws IOException {
        return new String(new ClassPathResource("db/migration/26.11.36__DDL_support_conversations.sql")
                .getContentAsByteArray(), StandardCharsets.UTF_8);
    }
}

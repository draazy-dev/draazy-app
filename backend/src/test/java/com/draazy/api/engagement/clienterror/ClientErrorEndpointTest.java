package com.draazy.api.engagement.clienterror;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("POST /client-errors — the browser's crash report")
class ClientErrorEndpointTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    private static String body(String reference, String message, String extra) {
        return """
                {"reference":"%s","kind":"render","scope":"app","path":"/listings/42?token=abc#top",
                 "name":"TypeError","message":"%s","stack":"TypeError: x\\n    at render (https://draazy.in/assets/index-Ab1.js:10:25)",
                 "build":"abc1234"%s}
                """.formatted(reference, message, extra);
    }

    private static final AtomicInteger ADDRESSES = new AtomicInteger();

    // Budgets live in a store shared across the context, so each test reports from its own address.
    private final String address = "10.9.0." + ADDRESSES.incrementAndGet();

    private ResultActions send(String json, String authorization) throws Exception {
        var request = post(Routes.ClientErrors.BASE).contentType(MediaType.APPLICATION_JSON).content(json)
                .with(r -> {
                    r.setRemoteAddr(address);
                    return r;
                });
        if (authorization != null) {
            request.header(HttpHeaders.AUTHORIZATION, authorization);
        }
        return mvc.perform(request);
    }

    private Map<String, Object> onlyRow() {
        return jdbc.queryForMap("select * from error_event where source = 'web'");
    }

    @Test
    @DisplayName("an anonymous report is stored scrubbed, with the path stripped and the reference as trace id")
    void storedScrubbed() throws Exception {
        String reference = UUID.randomUUID().toString();

        send(body(reference, "Cannot read asha@example.com 9876543210", ""), null).andExpect(status().isNoContent());

        Map<String, Object> row = onlyRow();
        assertThat(row.get("message")).isEqualTo("Cannot read [email] [number]");
        assertThat(row.get("path")).isEqualTo("/listings/42");
        assertThat(row.get("last_trace_id")).isEqualTo(reference);
        assertThat(row.get("error_type")).isEqualTo("TypeError");
        assertThat(row.get("occurrences")).isEqualTo(1);
        assertThat(row.get("user_role")).isNull();
    }

    @Test
    @DisplayName("a supplied lastTraceId is kept and the reference moves into the context")
    void lastTraceIdWins() throws Exception {
        String reference = UUID.randomUUID().toString();

        send(body(reference, "boom", ",\"lastTraceId\":\"trace-9\",\"context\":{\"viewport\":\"390x844\",\"online\":true}"),
                null).andExpect(status().isNoContent());

        Map<String, Object> row = onlyRow();
        assertThat(row.get("last_trace_id")).isEqualTo("trace-9");
        assertThat(row.get("context").toString()).contains(reference).contains("390x844");
    }

    @Test
    @DisplayName("the same crash again is one row with a higher count, and still a 204")
    void repeatsAreMerged() throws Exception {
        send(body(UUID.randomUUID().toString(), "Row 12 broke", ""), null).andExpect(status().isNoContent());
        send(body(UUID.randomUUID().toString(), "Row 98 broke", ""), null).andExpect(status().isNoContent());

        assertThat(onlyRow().get("occurrences")).isEqualTo(2);
    }

    @Test
    @DisplayName("a signed-in report records the role and user id")
    void principalIsRecorded() throws Exception {
        User owner = new User("9820000811", Roles.Wire.OWNER);
        owner.setMobileVerified(true);
        owner = users.saveAndFlush(owner);

        send(body(UUID.randomUUID().toString(), "boom", ""), bearer(owner)).andExpect(status().isNoContent());

        Map<String, Object> row = onlyRow();
        assertThat(row.get("user_role")).isEqualTo("owner");
        assertThat(row.get("last_user_id")).isEqualTo(owner.getId());
    }

    @Test
    @DisplayName("malformed reports are rejected")
    void validation() throws Exception {
        String ok = UUID.randomUUID().toString();
        send(body("not-a-uuid", "x", ""), null).andExpect(status().isUnprocessableEntity());
        send(body(ok, "x", "").replace("\"render\"", "\"other\""), null).andExpect(status().isUnprocessableEntity());
        send(body(ok, "x", "").replace("\"/listings/42?token=abc#top\"", "\"listings\""), null)
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("a body over 16 KB is a 413 and stores nothing")
    void tooLarge() throws Exception {
        send(body(UUID.randomUUID().toString(), "x".repeat(20_000), ""), null)
                .andExpect(status().isPayloadTooLarge());

        assertThat(jdbc.queryForObject("select count(*) from error_event where source = 'web'", Long.class)).isZero();
    }

    @Test
    @DisplayName("once 200 new web errors have been seen today, a new one is dropped but a known one still counts")
    void dailyCap() throws Exception {
        send(body(UUID.randomUUID().toString(), "a known failure", ""), null).andExpect(status().isNoContent());
        jdbc.update("""
                insert into error_event (fingerprint, source)
                select 'seed-' || g, 'web' from generate_series(1, 199) g
                """);

        send(body(UUID.randomUUID().toString(), "a brand new failure", ""), null).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("select count(*) from error_event where source = 'web'", Long.class))
                .isEqualTo(200);

        send(body(UUID.randomUUID().toString(), "a known failure", ""), null).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject(
                "select occurrences from error_event where message = 'a known failure'", Integer.class)).isEqualTo(2);
    }

    @Test
    @DisplayName("past 1,000 stored web errors, a new one is dropped whatever day they arrived")
    void tableCeiling() throws Exception {
        jdbc.update("""
                insert into error_event (fingerprint, source, first_seen)
                select 'seed-' || g, 'web', now() - interval '3 days' from generate_series(1, 1000) g
                """);

        send(body(UUID.randomUUID().toString(), "a brand new failure", ""), null).andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select count(*) from error_event where source = 'web'", Long.class))
                .isEqualTo(1000);
    }

    @Test
    @DisplayName("one caller cannot spend the shared cap: past its daily budget, its next new error is dropped")
    void perCallerBudget() throws Exception {
        for (int i = 0; i < ClientErrorService.NEW_PER_CALLER_PER_DAY + 1; i++) {
            send(body(UUID.randomUUID().toString(), "distinct failure " + "abcdefghijklmnopqrstuvwxyz".charAt(i), ""),
                    null).andExpect(status().isNoContent());
        }

        assertThat(jdbc.queryForObject("select count(*) from error_event where source = 'web'", Long.class))
                .isEqualTo(ClientErrorService.NEW_PER_CALLER_PER_DAY);
    }

    @Test
    @DisplayName("the last part of the daily cap is kept for signed-in users")
    void signedInReserve() throws Exception {
        jdbc.update("""
                insert into error_event (fingerprint, source)
                select 'seed-' || g, 'web' from generate_series(1, ?) g
                """, ClientErrorService.NEW_ANONYMOUS_PER_DAY);
        User owner = new User("9820000812", Roles.Wire.OWNER);
        owner.setMobileVerified(true);
        String auth = bearer(users.saveAndFlush(owner));

        send(body(UUID.randomUUID().toString(), "anonymous failure", ""), null).andExpect(status().isNoContent());
        send(body(UUID.randomUUID().toString(), "signed-in failure", ""), auth).andExpect(status().isNoContent());

        assertThat(jdbc.queryForList("select message from error_event where message is not null", String.class))
                .containsExactly("signed-in failure");
    }

    @Test
    @DisplayName("a repeat can neither rewrite the stored message nor reopen a resolved browser error")
    void repeatsCannotRewriteOrReopen() throws Exception {
        String opening = "y".repeat(200);
        send(body(UUID.randomUUID().toString(), opening + " first", ""), null).andExpect(status().isNoContent());
        jdbc.update("update error_event set resolved_at = now() where source = 'web'");

        String latest = UUID.randomUUID().toString();
        send(body(latest, opening + " planted", ",\"lastTraceId\":\"t-1\",\"context\":{\"viewport\":\"planted\"}"), null)
                .andExpect(status().isNoContent());

        Map<String, Object> row = onlyRow();
        assertThat(row.get("occurrences")).isEqualTo(2);
        assertThat((String) row.get("message")).endsWith(" first");
        assertThat(row.get("resolved_at")).isNotNull();
        assertThat(row.get("context").toString()).contains(latest).doesNotContain("planted");
    }
}
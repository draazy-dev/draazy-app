package com.draazy.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

@DisplayName("Admin error log — triage the captured errors")
class ErrorLogEndpointTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    private User admin;

    private String adminToken() {
        User u = new User("9820000821", Roles.Wire.ADMIN);
        u.setName("Error Reader");
        u.setMobileVerified(true);
        admin = users.saveAndFlush(u);
        return bearer(admin);
    }

    private UUID event(String fingerprint, String source, String message, String path, String lastSeen,
            boolean resolved) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into error_event (id, fingerprint, source, error_type, message, stack, path, http_method,
                                         http_status, last_trace_id, context, last_seen, resolved_at)
                values (?, ?, ?, 'java.lang.IllegalStateException', ?, 'stack here', ?, 'GET', 500, 'trace-' || ?,
                        '{"logger":"x"}'::jsonb, now() - cast(? as interval), case when ? then now() end)
                """, id, fingerprint, source, message, path, fingerprint, lastSeen, resolved);
        return id;
    }

    private String url(String path) {
        return path;
    }

    @Test
    @DisplayName("the list is open errors only by default, newest first, with the documented fields")
    void defaultList() throws Exception {
        String token = adminToken();
        event("fp-old", "api", "older failure", "/api/a", "2 hours", false);
        event("fp-new", "job", "newer failure", null, "1 minute", false);
        event("fp-done", "api", "handled failure", "/api/b", "1 hour", true);

        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].message").value("newer failure"))
                .andExpect(jsonPath("$.content[0].source").value("job"))
                .andExpect(jsonPath("$.content[0].occurrences").value(1))
                .andExpect(jsonPath("$.content[0].lastTraceId").value("trace-fp-new"))
                .andExpect(jsonPath("$.content[0].errorType").value("java.lang.IllegalStateException"))
                .andExpect(jsonPath("$.content[0].firstSeen").exists())
                .andExpect(jsonPath("$.content[0].lastSeen").exists())
                .andExpect(jsonPath("$.content[0].stack").doesNotExist())
                .andExpect(jsonPath("$.content[1].message").value("older failure"));
    }

    @Test
    @DisplayName("status and source filters narrow the list")
    void filters() throws Exception {
        String token = adminToken();
        event("fp-a", "api", "api failure", "/api/a", "1 hour", false);
        event("fp-w", "web", "web failure", "/listings", "1 hour", true);

        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("status", "resolved"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].source").value("web"))
                .andExpect(jsonPath("$.content[0].resolvedAt").exists());
        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("status", "all").param("source", "api"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].message").value("api failure"));
        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("source", "nope"))
                .andExpect(status().isBadRequest());
        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("status", "nope"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("q matches message, path, trace id and fingerprint, and % is literal")
    void search() throws Exception {
        String token = adminToken();
        event("fp-1", "api", "Payment gateway timed out", "/api/pay", "1 hour", false);
        event("fp-2", "api", "100% broken", "/api/other", "1 hour", false);

        for (String q : new String[] {"GATEWAY", "/api/pay", "trace-fp-1", "fp-1"}) {
            mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token).param("q", q))
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].message").value("Payment gateway timed out"));
        }
        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token).param("q", "%"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].message").value("100% broken"));
    }

    @Test
    @DisplayName("q finds a crash by the reference a user quotes, from the start of it")
    void searchByClientReference() throws Exception {
        String token = adminToken();
        UUID reference = UUID.randomUUID();
        event("fp-x", "web", "unrelated", "/listings", "1 hour", false);
        jdbc.update("update error_event set last_trace_id = 'trace-other', context = jsonb_build_object('reference', ?::text)"
                + " where fingerprint = 'fp-x'", reference.toString());
        event("fp-y", "web", "another", "/listings", "1 hour", false);

        for (String q : new String[] {reference.toString(), reference.toString().substring(0, 8).toUpperCase()}) {
            mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token).param("q", q))
                    .andExpect(jsonPath("$.totalElements").value(1))
                    .andExpect(jsonPath("$.content[0].message").value("unrelated"));
        }
        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("q", reference.toString().substring(9, 17)))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    @DisplayName("days keeps only errors last seen within the last N IST calendar days")
    void daysWindowFiltersByLastSeen() throws Exception {
        String token = adminToken();
        event("fp-days-new", "api", "days fresh failure", "/api/d1", "1 minute", false);
        UUID stale = event("fp-days-old", "api", "days stale failure", "/api/d2", "1 minute", false);
        jdbc.update("update error_event set last_seen = ? where id = ?", Timestamp.from(LocalDate.now(PlatformTime.IST)
                .atStartOfDay(PlatformTime.IST).toInstant().minus(1, ChronoUnit.MINUTES)), stale);

        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("q", "days ").param("days", "1"))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].message").value("days fresh failure"));
        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("q", "days ").param("days", "7"))
                .andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("q", "days "))
                .andExpect(jsonPath("$.totalElements").value(2));
        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, token)
                        .param("days", "99999"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("the detail adds stack, request, user and context")
    void detail() throws Exception {
        String token = adminToken();
        UUID id = event("fp-d", "api", "detail failure", "/api/d", "1 hour", false);

        mvc.perform(get(url(Routes.Admin.ERROR_LOG_BY_ID.replace("{id}", id.toString())))
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.fingerprint").value("fp-d"))
                .andExpect(jsonPath("$.level").value("error"))
                .andExpect(jsonPath("$.stack").value("stack here"))
                .andExpect(jsonPath("$.httpMethod").value("GET"))
                .andExpect(jsonPath("$.httpStatus").value(500))
                .andExpect(jsonPath("$.context.logger").value("x"))
                .andExpect(jsonPath("$.resolvedBy").doesNotExist());

        mvc.perform(get(url(Routes.Admin.ERROR_LOG_BY_ID.replace("{id}", UUID.randomUUID().toString())))
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
        mvc.perform(get(url(Routes.Admin.ERROR_LOG_BY_ID.replace("{id}", "nope")))
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("resolving records who and when, and leaves an audit entry")
    void resolve() throws Exception {
        String token = adminToken();
        UUID id = event("fp-r", "api", "to resolve", "/api/r", "1 hour", false);

        mvc.perform(post(url(Routes.Admin.ERROR_LOG_RESOLVE.replace("{id}", id.toString())))
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("select resolved_by from error_event where id = ?", UUID.class, id))
                .isEqualTo(admin.getId());
        assertThat(jdbc.queryForObject("select resolved_at is not null from error_event where id = ?",
                Boolean.class, id)).isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from audit_log where action = 'error-log.resolve' and entity = 'error_event'"
                        + " and entity_id = ?", Long.class, id.toString())).isEqualTo(1);

        mvc.perform(post(url(Routes.Admin.ERROR_LOG_RESOLVE.replace("{id}", UUID.randomUUID().toString())))
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("only admins may read or resolve")
    void guarded() throws Exception {
        User staff = new User("9820000822", Roles.Wire.STAFF);
        staff.setMobileVerified(true);
        String staffToken = bearer(users.saveAndFlush(staff));
        UUID id = event("fp-g", "api", "guarded", "/api/g", "1 hour", false);

        mvc.perform(get(url(Routes.Admin.ERROR_LOG)).header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(status().isForbidden());
        mvc.perform(post(url(Routes.Admin.ERROR_LOG_RESOLVE.replace("{id}", id.toString())))
                        .header(HttpHeaders.AUTHORIZATION, staffToken))
                .andExpect(status().isForbidden());
        mvc.perform(get(url(Routes.Admin.ERROR_LOG))).andExpect(status().isUnauthorized());
    }
}
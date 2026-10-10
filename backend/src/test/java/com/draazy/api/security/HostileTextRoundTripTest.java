package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import com.jayway.jsonpath.JsonPath;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.ObjectMapper;

/** Free text that looks like SQL, LIKE wildcards or bidi tricks is stored byte-for-byte, never interpreted. */
class HostileTextRoundTripTest extends AbstractApiTest {

    private static final String[] HOSTILE = {
            "O'Brien \"quoted\" ; -- trailing",
            "/* block */ ' OR '1'='1",
            "back\\slash % percent _ under",
            "modifier ʼ and smart ’ quotes",
            "rtl \u202Egnp.exe override",
            "emoji 🏠 and devanagari पुणे",
            "$1 $$ ${x} #{y} ?"
    };

    @Autowired
    UserRepository users;
    @Autowired
    ObjectMapper json;

    private User member(String mobile) {
        User u = new User(mobile, Roles.Wire.OWNER);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private MvcResult send(MockHttpServletRequestBuilder req,
            User actor, Map<String, String> body) throws Exception {
        return mvc.perform(req.header(HttpHeaders.AUTHORIZATION, bearer(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body))).andReturn();
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2, 3, 4, 5, 6})
    @DisplayName("a support ticket stores a hostile subject and body exactly, as one row")
    void supportTicketRoundTrip(int i) throws Exception {
        User asha = member("9819905" + String.format("%03d", i));
        String text = HOSTILE[i];
        Long before = jdbc.queryForObject("select count(*) from support_tickets", Long.class);

        MvcResult res = send(post(Routes.SupportTickets.BASE), asha,
                Map.of("subject", text, "category", "billing", "body", text));

        assertThat(res.getResponse().getStatus()).isEqualTo(201);
        String id = JsonPath.read(res.getResponse().getContentAsString(), "$.id");
        assertThat(jdbc.queryForObject("select count(*) from support_tickets", Long.class)).isEqualTo(before + 1);
        assertThat(jdbc.queryForObject("select subject from support_tickets where id = ?::uuid", String.class, id))
                .isEqualTo(text);
        assertThat(jdbc.queryForObject(
                "select body from support_ticket_messages where ticket_id = ?::uuid", String.class, id))
                .isEqualTo(text);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2, 3, 4, 5, 6})
    @DisplayName("a lead note stores a hostile note exactly")
    void leadNoteRoundTrip(int i) throws Exception {
        User meera = member("9819906" + String.format("%03d", i));
        String key = "documents:99f1c0de-0000-4000-8000-000000000001|PROP1";

        MvcResult res = send(put(URI.create(Routes.MeLeadNotes.BY_KEY.replace("{leadKey}",
                URLEncoder.encode(key, StandardCharsets.UTF_8)))), meera,
                Map.of("note", HOSTILE[i]));

        assertThat(res.getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbc.queryForObject(
                "select note from lead_notes where owner_id = ? and lead_key = ?", String.class, meera.getId(), key))
                .isEqualTo(HOSTILE[i]);
    }

    @ParameterizedTest
    @ValueSource(strings = {"subject", "body"})
    @DisplayName("a NUL character is a client error, never a 500")
    void nulIsRefusedAsBadInput(String field) throws Exception {
        User asha = member(field.equals("subject") ? "9819907001" : "9819907002");
        Map<String, String> body = new HashMap<>(Map.of("subject", "Plain", "body", "Plain"));
        body.put(field, "before\u0000after");

        MvcResult res = send(post(Routes.SupportTickets.BASE), asha, body);

        assertThat(res.getResponse().getStatus()).isEqualTo(400);
        assertThat(res.getResponse().getContentAsString()).doesNotContain("PSQLException", "0x00", "SQL");
    }

    @ParameterizedTest
    @ValueSource(strings = {"/admin/reviews", "/reports"})
    @DisplayName("% and _ typed into a JPQL-backed staff search match themselves, not any character")
    void wildcardsSearchLiterallyThroughJpql(String route) throws Exception {
        User author = member("9819908001");
        User admin = users.saveAndFlush(new User("8819908001", Roles.Wire.ADMIN));
        for (String text : new String[] {"promo 50%_off code", "promo 50xxoff code"}) {
            jdbc.update("insert into reviews (target_type, target_id, author_id, rating, body, status) "
                    + "values ('owner', ?, ?, 4, ?, 'pending')", UUID.randomUUID().toString(), author.getId(), text);
            jdbc.update("insert into reports (target_type, target_id, reporter_id, reason, details) "
                    + "values ('user', ?, ?, 'brokerage', ?)", UUID.randomUUID().toString(), author.getId(), text);
        }

        MvcResult res = mvc.perform(get(route).param("q", "50%_off")
                .header(HttpHeaders.AUTHORIZATION, bearer(admin))).andReturn();

        assertThat(res.getResponse().getStatus()).isEqualTo(200);
        assertThat(JsonPath.<Integer>read(res.getResponse().getContentAsString(), "$.totalElements")).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/societies", "/properties"})
    @DisplayName("a NUL in a search query is a client error, never a 500")
    void nulInSearchIsRefusedAsBadInput(String route) throws Exception {
        int status = mvc.perform(get(route)
                .param("q", "kothrud\u0000x")).andReturn().getResponse().getStatus();

        assertThat(status).isBetween(200, 499);
    }
}

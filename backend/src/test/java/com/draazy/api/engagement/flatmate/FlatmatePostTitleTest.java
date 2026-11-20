package com.draazy.api.engagement.flatmate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Flatmates — the poster's own headline on a room and a seeker post")
class FlatmatePostTitleTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    private final List<String> createdActors = new ArrayList<>();

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        createdActors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        createdActors.clear();
    }

    private User user(String mobile) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName("Host " + mobile.substring(6));
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private static String roomBody(User host, String title) {
        return """
                {"bhk":"2","roomType":"Private room","attachedBath":"attached",
                 "locality":"Baner","society":"Headline Heights","rentShare":15000,"deposit":30000,
                 "availableFrom":"2026-09-01",%s,
                 "hostRole":"owner","title":%s,%s,%s}
                """.formatted(FlatmateRoomFixture.photos(host.getId()), title, FlatmateRoomFixture.BASICS,
                FlatmateRoomFixture.DETAILS);
    }

    private static String postBody(String title) {
        return """
                {"name":"Asha","budget":18000,"localities":["Baner"],"title":%s}
                """.formatted(title);
    }

    @Test
    @DisplayName("a room keeps the headline its host typed, trimmed")
    void roomTitleIsStored() throws Exception {
        User host = user("9840007001");
        mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(roomBody(host, "\"  Sunny room near Baner high street  \"")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Sunny room near Baner high street"));
    }

    @Test
    @DisplayName("a room with no headline is still accepted — older clients send none")
    void roomTitleIsOptional() throws Exception {
        User host = user("9840007002");
        mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(roomBody(host, "null")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").doesNotExist());
    }

    @Test
    @DisplayName("a phone number in a room headline is refused")
    void roomTitleRefusesContact() throws Exception {
        User host = user("9840007003");
        mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(roomBody(host, "\"Call 9876543210 for the room\"")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.fields[0].field").value("title"));
    }

    @Test
    @DisplayName("a seeker post keeps its headline")
    void seekerTitleIsStored() throws Exception {
        mvc.perform(post("/flatmates/posts")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user("9840007004")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(postBody("\"Designer looking for a quiet flat in Baner\"")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.title").value("Designer looking for a quiet flat in Baner"));
    }

    @Test
    @DisplayName("a headline over 120 characters is refused")
    void seekerTitleIsBounded() throws Exception {
        mvc.perform(post("/flatmates/posts")
                        .header(HttpHeaders.AUTHORIZATION, bearer(user("9840007005")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(postBody("\"" + "a".repeat(121) + "\"")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.fields[0].field").value("title"));
    }
}

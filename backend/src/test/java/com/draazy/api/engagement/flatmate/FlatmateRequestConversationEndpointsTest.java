package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Flatmates — an accepted request, or a pending group join for its host, opens a chat")
class FlatmateRequestConversationEndpointsTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    @Autowired
    jakarta.persistence.EntityManager em;

    private final List<String> createdActors = new ArrayList<>();
    private int nextMobile = 1;

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        createdActors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        createdActors.clear();
    }

    private User user(String name) {
        User u = new User(String.format("98480200%02d", nextMobile++), Roles.Wire.OWNER);
        u.setName(name);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private static String idOf(String json) {
        return json.replaceAll("(?s).*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String room(User host) throws Exception {
        String json = mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"bhk":"2","roomType":"Private room","attachedBath":"attached","locality":"Aundh",
                                 "society":"Chat Towers","rentShare":15000,"deposit":30000,"hostRole":"owner",
                                 %s,%s,%s}
                                """.formatted(FlatmateRoomFixture.photos(host.getId()), FlatmateRoomFixture.BASICS,
                                FlatmateRoomFixture.DETAILS)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = idOf(json);
        em.flush();
        jdbc.update("update flatmate_rooms set mod_status = 'approved' where id = ?::uuid", id);
        em.clear();
        return id;
    }

    private String group(User host) throws Exception {
        String json = mvc.perform(post(Routes.Flatmates.GROUPS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Chat in Baner","locality":"Baner","policy":"any",
                                 "rent":30000,"deposit":10000,"seats":3,"seatsOpen":2,"name":"Host"}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = idOf(json);
        em.flush();
        jdbc.update("update flatmate_groups set mod_status = 'approved' where id = ?::uuid", id);
        em.clear();
        return id;
    }

    private String join(String groupId, User seeker) throws Exception {
        mvc.perform(post(Routes.Flatmates.GROUP_JOIN, groupId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(seeker))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"share\":\"solo\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("pending"));
        return jdbc.queryForObject(
                "select id::text from flatmate_requests where target_id = ?::uuid and requester_id = ?::uuid",
                String.class, groupId, seeker.getId().toString());
    }
    private String ask(String roomId, User seeker) throws Exception {
        mvc.perform(post(Routes.Flatmates.ROOM_INTEREST, roomId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(seeker))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"share\":\"solo\"}"))
                .andExpect(status().isCreated());
        return jdbc.queryForObject(
                "select id::text from flatmate_requests where target_id = ?::uuid and requester_id = ?::uuid",
                String.class, roomId, seeker.getId().toString());
    }

    private void decide(User host, String requestId, String decision) throws Exception {
        mvc.perform(patch(Routes.Flatmates.MY_REQUEST_BY_ID, requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"" + decision + "\"}"))
                .andExpect(status().isOk());
    }

    private ResultActions open(String requestId, User who) throws Exception {
        return mvc.perform(post(Routes.Conversations.FLATMATE_REQUEST, requestId)
                .header(HttpHeaders.AUTHORIZATION, bearer(who)));
    }

    @Test
    @DisplayName("both parties land in the same thread once the host accepts, and can talk in it")
    void acceptedRequestOpensOneSharedThread() throws Exception {
        User host = user("Host");
        User seeker = user("Seeker");
        String roomId = room(host);
        String requestId = ask(roomId, seeker);

        open(requestId, seeker).andExpect(status().isNotFound());
        decide(host, requestId, "accepted");

        String fromSeeker = idOf(open(requestId, seeker)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counterpartyName").value("Host"))
                .andExpect(jsonPath("$.counterpartyMobile").doesNotExist())
                .andExpect(jsonPath("$.flatmateKind").value("room"))
                .andExpect(jsonPath("$.flatmateTargetId").value(roomId))
                .andReturn().getResponse().getContentAsString());
        String fromHost = idOf(open(requestId, host).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(fromHost).isEqualTo(fromSeeker);

        mvc.perform(post(Routes.Conversations.REPLY, fromSeeker)
                        .header(HttpHeaders.AUTHORIZATION, bearer(seeker))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Can I see the room on Saturday?\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get(Routes.Conversations.BY_ID, fromSeeker)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flatmateKind").value("room"))
                .andExpect(jsonPath("$.messages[0].body").value("Can I see the room on Saturday?"));
    }

    @Test
    @DisplayName("a declined request and a stranger both get a 404")
    void onlyAnAcceptedRequestsPartiesGetIn() throws Exception {
        User host = user("Host2");
        User seeker = user("Seeker2");
        User stranger = user("Stranger");
        String roomId = room(host);
        String declined = ask(roomId, seeker);
        decide(host, declined, "declined");
        open(declined, seeker).andExpect(status().isNotFound());

        String accepted = ask(roomId, stranger);
        decide(host, accepted, "accepted");
        open(accepted, seeker).andExpect(status().isNotFound());
        open("not-a-uuid", seeker).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a group host can open a chat with a pending joiner to vet them; the joiner cannot until then")
    void hostVetsAPendingGroupJoiner() throws Exception {
        User host = user("GroupHost");
        User joiner = user("Joiner");
        String requestId = join(group(host), joiner);

        open(requestId, joiner).andExpect(status().isNotFound());
        String conversation = idOf(open(requestId, host)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.counterpartyName").value("Joiner"))
                .andExpect(jsonPath("$.counterpartyMobile").doesNotExist())
                .andReturn().getResponse().getContentAsString());

        mvc.perform(post(Routes.Conversations.REPLY, conversation)
                        .header(HttpHeaders.AUTHORIZATION, bearer(joiner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"Happy to share my work details.\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get(Routes.Conversations.BY_ID, conversation)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.messages[0].body").value("Happy to share my work details."));
        assertThat(jdbc.queryForObject("select status from flatmate_requests where id = ?::uuid",
                String.class, requestId)).isEqualTo("pending");
    }

    @Test
    @DisplayName("a pending room request stays closed to its host")
    void pendingRoomRequestStaysClosedToTheHost() throws Exception {
        User host = user("RoomHost");
        String requestId = ask(room(host), user("Seeker3"));

        open(requestId, host).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a declined group join is closed to the host")
    void declinedGroupJoinIsClosedToTheHost() throws Exception {
        User host = user("GroupHost2");
        String requestId = join(group(host), user("Seeker4"));
        decide(host, requestId, "declined");

        open(requestId, host).andExpect(status().isNotFound());
    }
}
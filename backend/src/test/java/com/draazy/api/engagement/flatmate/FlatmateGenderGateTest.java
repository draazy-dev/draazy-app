package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.draazy.api.support.UploadedPhotos;
import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Flatmates — women-only and men-only rooms and groups check who is asking")
class FlatmateGenderGateTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    @Autowired
    EntityManager entityManager;

    private final List<String> createdActors = new ArrayList<>();
    private int nextMobile = 1;

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        createdActors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        createdActors.clear();
    }

    private User user(String name) {
        User u = new User(String.format("98490000%02d", nextMobile++), Roles.Wire.OWNER);
        u.setName(name);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private static String idOf(String json) {
        return json.replaceAll(".*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String room(String gender) throws Exception {
        User host = user("Host");
        String json = mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(withSocietyIds("""
                                {"bhk":"2","roomType":"Private room","attachedBath":"attached",
                                 "furnishing":"semi","locality":"Baner","society":"Sunrise Heights",
                                 "rentShare":15000,"deposit":30000,"availableFrom":"2026-09-01",
                                 "lookingFor":"any","foodPref":"any","photos":["%s"],
                                 "hostRole":"owner","note":"Sunny room, quiet building."}
                                """.formatted(UploadedPhotos.of(host.getId())))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = idOf(json);
        jdbc.update("update flatmate_rooms set mod_status = 'approved', gender = ? where id = ?::uuid",
                gender, id);
        entityManager.clear();
        return id;
    }

    private String group(String policy) throws Exception {
        User host = user("Host");
        String id = idOf(mvc.perform(post(Routes.Flatmates.GROUPS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Team up in Baner","locality":"Baner","policy":"%s",
                                 "rent":30000,"seats":3,"seatsOpen":2,"name":"Host"}
                                """.formatted(policy)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        jdbc.update("update flatmate_groups set mod_status = 'approved' where id = ?::uuid", id);
        entityManager.clear();
        return id;
    }

    private void seekerPost(User author, String gender) throws Exception {
        mvc.perform(post(Routes.Flatmates.POSTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Seeker","gender":"%s","age":26,"occupation":"Designer",
                                 "budget":18000,"localities":["Baner"],"moveIn":"2026-09-01",
                                 "flatPref":"any","roomPref":"private","tags":["Vegetarian"],
                                 "note":"Quiet, tidy, work from home twice a week."}
                                """.formatted(gender)))
                .andExpect(status().isCreated());
    }

    private ResultActions interest(String roomId, User who, String body) throws Exception {
        return mvc.perform(post(Routes.Flatmates.ROOM_INTEREST, roomId)
                .header(HttpHeaders.AUTHORIZATION, bearer(who))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private ResultActions join(String groupId, User who, String body) throws Exception {
        return mvc.perform(post(Routes.Flatmates.GROUP_JOIN, groupId)
                .header(HttpHeaders.AUTHORIZATION, bearer(who))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    @Test
    @DisplayName("a woman is refused a men-only room, and nothing is stored")
    void womanRefusedMenOnlyRoom() throws Exception {
        String roomId = room("male");
        User seeker = user("Asha");

        interest(roomId, seeker, "{\"gender\":\"female\"}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message", containsString("open to men only")));

        assertThat(count("select count(*) from flatmate_requests where requester_id = ?::uuid",
                seeker.getId().toString())).isZero();
    }

    @Test
    @DisplayName("a man is welcome in a men-only room, and a woman in a women-only one")
    void matchingGenderIsAdmitted() throws Exception {
        interest(room("male"), user("Ravi"), "{\"gender\":\"male\"}").andExpect(status().isCreated());
        interest(room("female"), user("Asha"), "{\"gender\":\"female\"}").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("without a stated gender or a seeker post the request is asked for one")
    void unknownGenderIsAskedFor() throws Exception {
        interest(room("female"), user("Nobody"), "{}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message", containsString("Say whether you are a woman or a man")));
        interest(room("female"), user("Quiet"), "{\"gender\":\"any\"}")
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("the gender on the seeker's own post wins over what the request claims")
    void seekerPostGenderWins() throws Exception {
        User seeker = user("Asha");
        seekerPost(seeker, "female");

        interest(room("female"), seeker, "{}").andExpect(status().isCreated());
        interest(room("male"), seeker, "{\"gender\":\"male\"}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message", containsString("open to men only")));
    }

    @Test
    @DisplayName("rooms open to anyone never ask")
    void openRoomNeverAsks() throws Exception {
        interest(room("any"), user("Anyone"), "{}").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a man is refused a women-only group; a woman who says so is accepted")
    void womenOnlyGroup() throws Exception {
        String groupId = group("women");

        join(groupId, user("Ravi"), "{\"gender\":\"male\"}")
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message", containsString("open to women only")));
        join(groupId, user("Anyone"), "{}").andExpect(status().isUnprocessableEntity());
        join(groupId, user("Asha"), "{\"gender\":\"female\"}").andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a men-only group refuses a woman, and an open group asks nothing")
    void menOnlyAndOpenGroups() throws Exception {
        join(group("men"), user("Asha"), "{\"gender\":\"female\"}")
                .andExpect(status().isUnprocessableEntity());
        join(group("any"), user("Anyone"), "{}").andExpect(status().isCreated());
    }
}

package com.draazy.api.engagement.flatmate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** Fixtures for the living-style board tests: everything lives in one locality so the feed can be narrowed to it. */
abstract class FlatmateStyleFixtures extends AbstractApiTest {

    static final String TOWN = "StyleTown";

    @Autowired
    UserRepository users;

    @PersistenceContext
    EntityManager em;

    private final List<String> actors = new ArrayList<>();

    @BeforeEach
    void townIsLive() {
        liveLocality(TOWN);
    }

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        actors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        actors.clear();
    }

    User person(String mobile) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName("Person " + mobile);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        actors.add(saved.getId().toString());
        return saved;
    }

    void answers(User who, String json) {
        jdbc.update("insert into user_living_style (user_id, answers) values (?, ?::jsonb)", who.getId(), json);
    }

    String create(String route, User author, String body) throws Exception {
        String json = mvc.perform(post(route)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll(".*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    String room(User host) throws Exception {
        return approved("flatmate_rooms", create(Routes.Flatmates.ROOMS, host, """
                {"bhk":"2","roomType":"Private room","attachedBath":"attached",
                 "locality":"%s","society":"Style Heights",
                 "rentShare":15000,"deposit":30000,"availableFrom":"2026-09-01",
                 "lookingFor":"any","foodPref":"any","lat":18.5912345,"lng":73.7712345,
                 %s,"hostRole":"owner","note":"Sunny.",%s,%s}
                """.formatted(TOWN, FlatmateRoomFixture.photos(host.getId()), FlatmateRoomFixture.BASICS,
                FlatmateRoomFixture.DETAILS)));
    }

    String group(User host) throws Exception {
        return approved("flatmate_groups", create(Routes.Flatmates.GROUPS, host, """
                {"title":"Style trio","policy":"any","seats":3,"seatsOpen":1,"name":"Host",
                 "preferences":{"localities":["%s"],"rentMax":40000,"depositMax":100000,
                   "gatedOnly":false,"bachelors":false}}
                """.formatted(TOWN)));
    }

    String seekerPost(User author) throws Exception {
        return approved("flatmate_seeker_posts", create(Routes.Flatmates.POSTS, author, """
                {"name":"Seeker","gender":"any","age":27,"occupation":"Analyst",
                 "budget":18000,"localities":["%s"],"moveIn":"2026-09-01",
                 "flatPref":"any","roomPref":"private","note":"Hello."}
                """.formatted(TOWN)));
    }

    String approved(String table, String id) {
        jdbc.update("update " + table + " set mod_status = 'approved' where id = ?::uuid", id);
        em.clear();
        return id;
    }
}

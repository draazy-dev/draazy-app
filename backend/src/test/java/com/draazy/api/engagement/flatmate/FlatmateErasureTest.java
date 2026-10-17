package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Flatmates — erasing an account gives its group seats back")
class FlatmateErasureTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    @Autowired
    EntityManager entityManager;

    @Autowired
    PropertyRepository properties;

    private final List<String> createdActors = new ArrayList<>();
    private int nextMobile = 1;

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        createdActors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        createdActors.clear();
    }

    private User user(String name, String role) {
        User u = new User(String.format("98500000%02d", nextMobile++), role);
        u.setName(name);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private String group(User host) throws Exception {
        String json = mvc.perform(post(Routes.Flatmates.GROUPS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Team up in Baner","locality":"Baner","policy":"any",
                                 "rent":30000,"seats":3,"seatsOpen":2,"name":"Host"}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = json.replaceAll(".*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
        jdbc.update("update flatmate_groups set mod_status = 'approved' where id = ?::uuid", id);
        entityManager.clear();
        return id;
    }

    private void erase(User subject, User admin) throws Exception {
        String body = mvc.perform(post("/me/erasure")
                        .header(HttpHeaders.AUTHORIZATION, bearer(subject))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Moving away\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String requestId = body.replaceAll("^.*\"id\":\"([^\"]+)\".*$", "$1");
        mvc.perform(patch("/admin/erasure-requests/{id}", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"execute\"}"))
                .andExpect(status().isOk());
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    @Test
    @DisplayName("an erased member leaves the group: seat reopened, membership gone, host told")
    void erasedMemberLeavesTheirGroups() throws Exception {
        User host = user("Host", Roles.Wire.OWNER);
        User member = user("Leaving", Roles.Wire.BUYER);
        User stayer = user("Staying", Roles.Wire.BUYER);
        User admin = user("Admin", Roles.Wire.ADMIN);
        String groupId = group(host);
        for (User joiner : List.of(member, stayer)) {
            mvc.perform(post(Routes.Flatmates.GROUP_JOIN, groupId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(joiner))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isCreated());
        }
        assertThat(count("select seats_open from flatmate_groups where id = ?::uuid", groupId)).isZero();

        erase(member, admin);

        assertThat(count("select count(*) from flatmate_group_members where group_id = ?::uuid "
                + "and user_id = ?::uuid", groupId, member.getId().toString())).isZero();
        assertThat(count("select count(*) from flatmate_group_members where group_id = ?::uuid "
                + "and user_id = ?::uuid", groupId, stayer.getId().toString())).isEqualTo(1);
        assertThat(count("select seats_open from flatmate_groups where id = ?::uuid", groupId))
                .isEqualTo(1);
        assertThat(count("select count(*) from notifications where user_id = ?::uuid "
                + "and type = 'flatmate.group.left'", host.getId().toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("an erased author's unanswered incoming asks are deleted, not left dangling")
    void erasedAuthorsIncomingAsksGo() throws Exception {
        User author = user("Author", Roles.Wire.BUYER);
        User asker = user("Asker", Roles.Wire.BUYER);
        User admin = user("Admin", Roles.Wire.ADMIN);
        String postId = mvc.perform(post(Routes.Flatmates.POSTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Asha\",\"budget\":18000,\"localities\":[\"Baner\"]}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString()
                .replaceAll(".*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
        mvc.perform(post(Routes.Flatmates.POST_INTEREST, postId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(asker))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated());

        erase(author, admin);

        assertThat(count("select count(*) from flatmate_requests where target_id = ?::uuid", postId)).isZero();
    }

    @Test
    @DisplayName("an erased group host's unanswered applications leave the owner's inbox")
    void erasedHostsApplicationsGo() throws Exception {
        User owner = user("Owner", Roles.Wire.OWNER);
        User host = user("Host", Roles.Wire.BUYER);
        User admin = user("Admin", Roles.Wire.ADMIN);
        Property flat = new Property(owner, "3BHK in Baner", "rent", "apartment", 30000L, "Baner", "Pune");
        flat.setBhk(new BigDecimal("3"));
        flat.setStatus("approved");
        flat.setPriceUnit("per-month");
        flat.setArea(new BigDecimal("1100"));
        properties.saveAndFlush(flat);
        String groupId = group(host);
        mvc.perform(post(Routes.Flatmates.GROUP_APPLY.replace("{id}", groupId))
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"listingId\":\"" + flat.getId() + "\"}"))
                .andExpect(status().isCreated());

        erase(host, admin);

        assertThat(count("select count(*) from flatmate_group_applications where group_id = ?::uuid", groupId))
                .isZero();
    }
}

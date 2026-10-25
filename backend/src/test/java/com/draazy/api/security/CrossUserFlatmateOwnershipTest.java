package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.engagement.flatmate.FlatmateRoomFixture;
import com.draazy.api.identity.user.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

@DisplayName("Cross-user ownership - flatmate posts, rooms and groups belong to their host")
class CrossUserFlatmateOwnershipTest extends AbstractSecurityTest {

    private static final String BUYER = "buyer";

    private static final String SEEKER = """
            {"name":"Asha","budget":18000,"localities":["Baner"],"moveIn":"2026-09-01","note":"Tidy."}
            """;

    private String room(User host, long rentShare) {
        return withSocietyIds("""
                {"bhk":"2","roomType":"Private room","attachedBath":"attached",
                 "locality":"Baner","society":"Sunrise Heights","rentShare":%d,"deposit":30000,
                 "availableFrom":"2026-09-01","lookingFor":"any","foodPref":"any",
                 %s,"hostRole":"owner","note":"Sunny room.",%s,%s}
                """.formatted(rentShare, FlatmateRoomFixture.photos(host.getId()), FlatmateRoomFixture.BASICS,
                FlatmateRoomFixture.DETAILS));
    }

    private static String group(String title) {
        return """
                {"title":"%s","locality":"Baner","policy":"women","rent":40000,"deposit":10000,
                 "seats":3,"seatsOpen":1,"name":"Host"}
                """.formatted(title);
    }

    private String create(User host, String route, String body) throws Exception {
        return idOf(mvc.perform(post(route).header(HttpHeaders.AUTHORIZATION, bearer(host)).contentType(JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    @Test
    @DisplayName("DELETE /flatmates/posts/{id} by another user is a 404 and the post stays live")
    void deletingSomeoneElsesSeekerPost() throws Exception {
        User a = user("9898100001", BUYER);
        User b = user("9898100002", BUYER);
        String id = create(a, Routes.Flatmates.POSTS, SEEKER);
        String before = row("flatmate_seeker_posts", uuid(id));

        mvc.perform(delete(Routes.Flatmates.POST_BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(b)))
                .andExpect(status().isNotFound());

        assertThat(row("flatmate_seeker_posts", uuid(id))).isEqualTo(before);
        assertThat(count("select count(*) from flatmate_seeker_posts where id = ?::uuid and archived = false", id))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("PATCH /flatmates/rooms/{id} by another user is a 404 and the room is unchanged")
    void editingSomeoneElsesRoom() throws Exception {
        User a = user("9898100003", BUYER);
        User b = user("9898100004", BUYER);
        String id = create(a, Routes.Flatmates.ROOMS, room(a, 15000));
        String before = row("flatmate_rooms", uuid(id));

        mvc.perform(patch(Routes.Flatmates.ROOM_BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(b))
                        .contentType(JSON).content(room(b, 1000)))
                .andExpect(status().isNotFound());

        assertThat(row("flatmate_rooms", uuid(id))).isEqualTo(before);
    }

    @Test
    @DisplayName("PATCH /flatmates/groups/{id} by another user is a 404 and the group is unchanged")
    void editingSomeoneElsesGroup() throws Exception {
        User a = user("9898100005", BUYER);
        User b = user("9898100006", BUYER);
        String id = create(a, Routes.Flatmates.GROUPS, group("Baner 3BHK"));
        String before = row("flatmate_groups", uuid(id));

        mvc.perform(patch(Routes.Flatmates.GROUP_BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(b))
                        .contentType(JSON).content(group("Hijacked")))
                .andExpect(status().isNotFound());

        assertThat(row("flatmate_groups", uuid(id))).isEqualTo(before);
    }

    @Test
    @DisplayName("DELETE /flatmates/groups/{id} by another user is a 404 and the group stays live")
    void deletingSomeoneElsesGroup() throws Exception {
        User a = user("9898100007", BUYER);
        User b = user("9898100008", BUYER);
        String id = create(a, Routes.Flatmates.GROUPS, group("Baner 3BHK"));
        String before = row("flatmate_groups", uuid(id));

        mvc.perform(delete(Routes.Flatmates.GROUP_BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(b)))
                .andExpect(status().isNotFound());

        assertThat(row("flatmate_groups", uuid(id))).isEqualTo(before);
        assertThat(count("select count(*) from flatmate_groups where id = ?::uuid and archived = false", id))
                .isEqualTo(1);
    }
}

package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("Flatmate board — tab-specific facets: bhk, vegOnly, parking, age, minOpenSeats")
class FlatmateTabFacetsTest extends FlatmateStyleFixtures {

    private String roomTwoVegBike;
    private String roomThreeAnyCar;
    private String roomFourNonvegNone;
    private String post22;
    private String post28;
    private String post35;
    private String postNoAge;
    private String teamWantsTwo;
    private String teamWantsThreeTwoOpen;
    private String teamAnySizeNullOpen;

    @BeforeEach
    void board() throws Exception {
        roomTwoVegBike = room("9869300001", "2", "veg", "bike");
        roomThreeAnyCar = room("9869300002", "3", "any", "car");
        roomFourNonvegNone = room("9869300003", "4", "nonveg", null);

        post22 = post("9869300011", 22);
        post28 = post("9869300012", 28);
        post35 = post("9869300013", 35);
        postNoAge = post("9869300014", null);

        teamWantsTwo = team("9869300021", "[\"2\"]", 1);
        teamWantsThreeTwoOpen = team("9869300022", "[\"3\"]", 2);
        teamAnySizeNullOpen = team("9869300023", "[]", null);
    }

    private String room(String mobile, String bhk, String food, String parking) throws Exception {
        String id = room(person(mobile));
        jdbc.update("update flatmate_rooms set bhk = ?, food = ?, parking = ? where id = ?::uuid",
                bhk, food, parking, id);
        em.clear();
        return id;
    }

    private String post(String mobile, Integer age) throws Exception {
        String id = seekerPost(person(mobile));
        jdbc.update("update flatmate_seeker_posts set age = ? where id = ?::uuid", age, id);
        em.clear();
        return id;
    }

    // Two seats beyond the current members, so seats_open alone decides how many are open.
    private String team(String mobile, String prefBhk, Integer seatsOpen) throws Exception {
        String id = group(person(mobile));
        Integer members = jdbc.queryForObject(
                "select count(*) from flatmate_group_members where group_id = ?::uuid", Integer.class, id);
        jdbc.update("update flatmate_groups set pref_bhk = ?::jsonb, seats_total = ?, seats_open = ?"
                + " where id = ?::uuid", prefBhk, members + 2, seatsOpen, id);
        em.clear();
        return id;
    }

    private List<String> ids(String tab, String... params) throws Exception {
        MockHttpServletRequestBuilder request = get(Routes.Flatmates.FEED)
                .param("tab", tab).param("locality", TOWN).param("size", "50");
        for (int i = 0; i < params.length; i += 2) {
            request.param(params[i], params[i + 1]);
        }
        String json = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.content[*].id");
    }

    @Test
    @DisplayName("bhk narrows rooms to that flat size; 4 is the 4+ bucket; unknown values widen")
    void roomBhk() throws Exception {
        assertThat(ids("move-in", "bhk", "2")).containsExactly(roomTwoVegBike);
        assertThat(ids("move-in", "bhk", "4")).containsExactly(roomFourNonvegNone);
        assertThat(ids("move-in", "bhk", "1")).isEmpty();
        assertThat(ids("move-in", "bhk", "7")).hasSize(3);
    }

    @Test
    @DisplayName("vegOnly keeps veg households; parking=bike also takes a car spot, car only a car spot")
    void vegAndParking() throws Exception {
        assertThat(ids("move-in", "vegOnly", "true")).containsExactly(roomTwoVegBike);
        assertThat(ids("move-in", "vegOnly", "false")).hasSize(3);
        assertThat(ids("move-in", "parking", "bike")).containsExactlyInAnyOrder(roomTwoVegBike, roomThreeAnyCar);
        assertThat(ids("move-in", "parking", "car")).containsExactly(roomThreeAnyCar);
        assertThat(ids("move-in", "parking", "boat")).hasSize(3);
        assertThat(ids("move-in", "vegOnly", "true", "parking", "car")).isEmpty();
    }

    @Test
    @DisplayName("an age band keeps seekers inside it and drops seekers who gave no age")
    void seekerAge() throws Exception {
        assertThat(ids("people")).hasSize(4);
        assertThat(ids("people", "minAge", "18", "maxAge", "24")).containsExactly(post22);
        assertThat(ids("people", "minAge", "25", "maxAge", "30")).containsExactly(post28);
        assertThat(ids("people", "minAge", "31")).containsExactly(post35);
        assertThat(ids("people", "minAge", "30", "maxAge", "20")).hasSize(4);
        assertThat(ids("people", "minAge", "5")).hasSize(4);
        assertThat(ids("people", "minAge", "18")).doesNotContain(postNoAge).hasSize(3);
    }

    @Test
    @DisplayName("teams match a hunted bhk or any size, and minOpenSeats counts seats_open over member room")
    void teamBhkAndSeats() throws Exception {
        assertThat(ids("teams", "bhk", "2")).containsExactlyInAnyOrder(teamWantsTwo, teamAnySizeNullOpen);
        assertThat(ids("teams", "bhk", "3")).containsExactlyInAnyOrder(teamWantsThreeTwoOpen, teamAnySizeNullOpen);
        assertThat(ids("teams", "minOpenSeats", "2"))
                .containsExactlyInAnyOrder(teamWantsThreeTwoOpen, teamAnySizeNullOpen);
        assertThat(ids("teams", "minOpenSeats", "3")).isEmpty();
        assertThat(ids("teams", "minOpenSeats", "1")).hasSize(3);
    }

    @Test
    @DisplayName("each facet leaves the kinds that do not carry it alone")
    void facetsStayOnTheirKind() throws Exception {
        assertThat(ids("people", "bhk", "4", "vegOnly", "true", "parking", "car", "minOpenSeats", "2")).hasSize(4);
        assertThat(ids("move-in", "minAge", "31", "minOpenSeats", "2")).hasSize(3);
        assertThat(ids("teams", "vegOnly", "true", "parking", "car", "minAge", "31")).hasSize(3);
        assertThat(ids("team-up", "minAge", "31", "minOpenSeats", "2"))
                .containsExactlyInAnyOrder(post35, teamWantsThreeTwoOpen, teamAnySizeNullOpen);
    }
}

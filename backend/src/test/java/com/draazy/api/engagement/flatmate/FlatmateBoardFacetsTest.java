package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("Flatmate board — strictGender, roomType, furnishing, gated")
class FlatmateBoardFacetsTest extends FlatmateStyleFixtures {

    @Autowired
    PropertyRepository properties;

    private String anyPrivateFurnishedGated;
    private String femalePrivateSemi;
    private String maleSharedBare;
    private String housed;
    private String postAny;
    private String postFemalePrivate;
    private String postFemaleShared;
    private String postMaleAny;
    private String teamAny;
    private String teamWomen;

    @BeforeEach
    void board() throws Exception {
        anyPrivateFurnishedGated = room("9860000001", "any", "Private room", "furnished", true);
        femalePrivateSemi = room("9860000002", "female", "Private room", "semi", false);
        maleSharedBare = room("9860000003", "male", "Shared room", "unfurnished", false);

        postAny = post("9860000011", "any", "any");
        postFemalePrivate = post("9860000012", "female", "private");
        postFemaleShared = post("9860000013", "female", "shared");
        postMaleAny = post("9860000014", "male", "any");

        teamAny = team("9860000021", "any");
        teamWomen = team("9860000022", "women");

        User host = person("9860000031");
        UUID flat = properties.saveAndFlush(new Property(host, "Facet flat " + UUID.randomUUID(), "rent",
                "apartment", 36000L, TOWN, "Pune")).getId();
        housed = group(host);
        jdbc.update("update flatmate_groups set property_id = ?, hunting = false, policy = 'any' where id = ?::uuid",
                flat, housed);
        em.clear();
    }

    private String room(String mobile, String gender, String type, String furnishing, boolean gated)
            throws Exception {
        String id = room(person(mobile));
        jdbc.update("update flatmate_rooms set gender = ?, room_type = ?, furnishing = ?, gated_community = ?"
                + " where id = ?::uuid", gender, type, furnishing, gated, id);
        em.clear();
        return id;
    }

    private String post(String mobile, String gender, String roomPref) throws Exception {
        String id = seekerPost(person(mobile));
        jdbc.update("update flatmate_seeker_posts set gender = ?, room_pref = ? where id = ?::uuid",
                gender, roomPref, id);
        em.clear();
        return id;
    }

    private String team(String mobile, String policy) throws Exception {
        String id = group(person(mobile));
        jdbc.update("update flatmate_groups set policy = ? where id = ?::uuid", policy, id);
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
    @DisplayName("without any facet the move-in tab holds rooms only, and the housed group is on no tab")
    void baseline() throws Exception {
        assertThat(ids("move-in")).containsExactlyInAnyOrder(
                anyPrivateFurnishedGated, femalePrivateSemi, maleSharedBare);
        for (String tab : new String[] {"move-in", "people", "teams", "team-up"}) {
            assertThat(ids(tab)).as(tab).doesNotContain(housed);
        }
    }

    @Test
    @DisplayName("gender alone keeps rows open to anyone; strictGender drops them on every kind")
    void strictGender() throws Exception {
        assertThat(ids("move-in", "gender", "female")).containsExactlyInAnyOrder(
                anyPrivateFurnishedGated, femalePrivateSemi);
        assertThat(ids("move-in", "gender", "female", "strictGender", "true"))
                .containsExactly(femalePrivateSemi);

        assertThat(ids("people", "gender", "female")).containsExactlyInAnyOrder(
                postAny, postFemalePrivate, postFemaleShared);
        assertThat(ids("people", "gender", "female", "strictGender", "true"))
                .containsExactlyInAnyOrder(postFemalePrivate, postFemaleShared);

        assertThat(ids("teams", "gender", "female")).containsExactlyInAnyOrder(teamAny, teamWomen);
        assertThat(ids("teams", "gender", "female", "strictGender", "true")).containsExactly(teamWomen);
    }

    @Test
    @DisplayName("strictGender without a named gender, or with an unknown value, filters nothing")
    void strictGenderNeedsAGender() throws Exception {
        assertThat(ids("move-in", "strictGender", "true")).hasSize(3);
        assertThat(ids("move-in", "gender", "any", "strictGender", "true"))
                .containsExactlyInAnyOrderElementsOf(ids("move-in", "gender", "any"));
        assertThat(ids("move-in", "gender", "female", "strictGender", "yes"))
                .containsExactlyInAnyOrder(anyPrivateFurnishedGated, femalePrivateSemi);
    }

    @Test
    @DisplayName("roomType narrows rooms, matches seekers by preference or 'any', and leaves teams alone")
    void roomType() throws Exception {
        assertThat(ids("move-in", "roomType", "private"))
                .containsExactlyInAnyOrder(anyPrivateFurnishedGated, femalePrivateSemi);
        assertThat(ids("move-in", "roomType", "shared")).containsExactly(maleSharedBare);

        assertThat(ids("people", "roomType", "private"))
                .containsExactlyInAnyOrder(postAny, postFemalePrivate, postMaleAny);
        assertThat(ids("people", "roomType", "shared"))
                .containsExactlyInAnyOrder(postAny, postFemaleShared, postMaleAny);

        assertThat(ids("teams", "roomType", "private")).containsExactlyInAnyOrder(teamAny, teamWomen);
        assertThat(ids("move-in", "roomType", "dorm")).hasSize(3);
    }

    @Test
    @DisplayName("furnishing and gated narrow rooms; unknown values widen")
    void furnishingAndGated() throws Exception {
        assertThat(ids("move-in", "furnishing", "furnished")).containsExactly(anyPrivateFurnishedGated);
        assertThat(ids("move-in", "furnishing", "semi")).containsExactly(femalePrivateSemi);
        assertThat(ids("move-in", "furnishing", "unfurnished")).containsExactly(maleSharedBare);
        assertThat(ids("move-in", "gated", "true")).containsExactly(anyPrivateFurnishedGated);
        assertThat(ids("move-in", "furnishing", "luxury")).hasSize(3);
        assertThat(ids("move-in", "gated", "maybe")).hasSize(3);
        assertThat(ids("move-in", "gated", "false")).hasSize(3);
        assertThat(ids("move-in", "roomType", "private", "furnishing", "furnished", "gated", "true"))
                .containsExactly(anyPrivateFurnishedGated);
    }

    @Test
    @DisplayName("room-only facets narrow move-in and leave people and teams alone")
    void roomFacetsLeavePeopleAndTeamsAlone() throws Exception {
        assertThat(ids("move-in", "attachedBath", "attached")).contains(anyPrivateFurnishedGated);

        assertThat(ids("people", "attachedBath", "attached", "gated", "true", "furnishing", "semi")).hasSize(4);
        assertThat(ids("teams", "attachedBath", "attached", "gated", "true", "furnishing", "semi")).hasSize(2);
    }

    @Test
    @DisplayName("tabElements counts the same facets on every tab")
    void tabCountsFollowTheFacets() throws Exception {
        String json = mvc.perform(get(Routes.Flatmates.FEED).param("tab", "move-in").param("locality", TOWN)
                        .param("gender", "female").param("strictGender", "true").param("roomType", "private"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(((Number) JsonPath.read(json, "$.tabElements.move-in")).intValue()).isEqualTo(1);
        assertThat(((Number) JsonPath.read(json, "$.tabElements.people")).intValue()).isEqualTo(1);
        assertThat(((Number) JsonPath.read(json, "$.tabElements.teams")).intValue()).isEqualTo(1);
    }
}

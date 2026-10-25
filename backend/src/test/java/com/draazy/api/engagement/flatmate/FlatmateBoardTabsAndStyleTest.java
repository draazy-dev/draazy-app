package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("Flatmate board — people/teams tabs and living-style matches")
class FlatmateBoardTabsAndStyleTest extends FlatmateStyleFixtures {

    private static final String VIEWER = "{\"tidy\":0,\"food\":1,\"sleep\":2,\"wfh\":2}";

    private MockHttpServletRequestBuilder feed(String tab) {
        return get(Routes.Flatmates.FEED).param("tab", tab).param("locality", TOWN).param("size", "50");
    }

    private String body(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    private static List<String> ids(String json) {
        return JsonPath.read(json, "$.content[*].id");
    }

    @Test
    @DisplayName("people lists seeker posts only, teams hunting groups only, and tabElements counts all three")
    void tabsSplitTheTeamUpSupply() throws Exception {
        String room = room(person("9840000001"));
        String postA = seekerPost(person("9840000002"));
        String postB = seekerPost(person("9840000003"));
        String team = group(person("9840000004"));

        String people = body(feed("people"));
        assertThat(ids(people)).containsExactlyInAnyOrder(postA, postB);

        String teams = body(feed("teams"));
        assertThat(ids(teams)).containsExactly(team);

        assertThat(ids(body(feed("move-in")))).containsExactly(room);
        assertThat(ids(body(feed("team-up")))).containsExactlyInAnyOrder(postA, postB, team);

        Map<String, Integer> expected = Map.of("move-in", 1, "people", 2, "teams", 1);
        for (String tab : List.of("move-in", "people", "teams", "team-up")) {
            Map<String, Integer> counts = JsonPath.read(body(feed(tab)), "$.tabElements");
            assertThat(counts).as(tab).isEqualTo(expected);
        }
    }

    @Test
    @DisplayName("otherTabElements keeps its meaning: move-in counts people plus teams, any other tab counts move-in")
    void otherTabElementsIsUnchanged() throws Exception {
        room(person("9840000011"));
        seekerPost(person("9840000012"));
        group(person("9840000013"));
        group(person("9840000014"));

        assertThat((Number) JsonPath.read(body(feed("move-in")), "$.otherTabElements")).isEqualTo(3);
        for (String tab : List.of("people", "teams", "team-up")) {
            assertThat((Number) JsonPath.read(body(feed(tab)), "$.otherTabElements")).as(tab).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("the legacy view alias still resolves")
    void legacyViewAlias() throws Exception {
        seekerPost(person("9840000021"));
        group(person("9840000022"));

        assertThat(ids(body(get(Routes.Flatmates.FEED).param("view", "groups").param("locality", TOWN)))).hasSize(2);
    }

    @Test
    @DisplayName("a guest gets an empty matches map")
    void guestHasNoMatches() throws Exception {
        answers(person("9840000031"), VIEWER);
        room(users.findByMobile("9840000031").orElseThrow());

        Map<String, Integer> matches = JsonPath.read(body(feed("move-in")), "$.matches");
        assertThat(matches).isEmpty();
    }

    @Test
    @DisplayName("a viewer with answers gets scores for authors with three or more answers in common, never their own rows")
    void viewerGetsScores() throws Exception {
        User viewer = person("9840000041");
        answers(viewer, VIEWER);
        User great = person("9840000042");
        answers(great, VIEWER);
        User poor = person("9840000043");
        answers(poor, "{\"tidy\":2,\"food\":0,\"sleep\":0,\"wfh\":0}");
        User thin = person("9840000044");
        answers(thin, "{\"tidy\":0,\"food\":1}");
        User silent = person("9840000045");

        String roomGreat = room(great);
        String roomPoor = room(poor);
        String roomThin = room(thin);
        String roomSilent = room(silent);
        String roomOwn = room(viewer);

        Map<String, Integer> matches = JsonPath.read(
                body(feed("move-in").header(HttpHeaders.AUTHORIZATION, bearer(viewer))), "$.matches");
        assertThat(matches).containsOnly(
                Map.entry("room:" + roomGreat, 100),
                Map.entry("room:" + roomPoor, 13));
        assertThat(matches).doesNotContainKeys("room:" + roomThin, "room:" + roomSilent, "room:" + roomOwn);
    }

    @Test
    @DisplayName("groups and posts are keyed by their own kind")
    void keysCarryTheKind() throws Exception {
        User viewer = person("9840000051");
        answers(viewer, VIEWER);
        User author = person("9840000052");
        answers(author, VIEWER);
        String post = seekerPost(author);
        String team = group(author);

        Map<String, Integer> matches = JsonPath.read(
                body(feed("team-up").header(HttpHeaders.AUTHORIZATION, bearer(viewer))), "$.matches");
        assertThat(matches).containsOnly(Map.entry("post:" + post, 100), Map.entry("group:" + team, 100));
    }

    @Test
    @DisplayName("sort=match lets a better living-style match outrank a fresher listing")
    void matchSortPrefersTheBetterStyleMatch() throws Exception {
        User viewer = person("9840000061");
        answers(viewer, VIEWER);
        User great = person("9840000062");
        answers(great, VIEWER);
        String roomGreat = room(great);
        String roomSilent = room(person("9840000063"));
        jdbc.update("update flatmate_rooms set created_at = now() - interval '1 day' where id = ?::uuid", roomGreat);
        em.clear();

        List<String> byMatch = ids(body(feed("move-in").param("sort", "match")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))));
        assertThat(byMatch).containsExactly(roomGreat, roomSilent);

        assertThat(ids(body(feed("move-in").param("sort", "match")))).containsExactly(roomSilent, roomGreat);
        assertThat(ids(body(feed("move-in").param("sort", "newest")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))))).containsExactly(roomSilent, roomGreat);
    }

    @Test
    @DisplayName("a viewer's own listing never earns a style bonus, and fewer than three answers add no term")
    void ownRowAndThinViewerAddNothing() throws Exception {
        User viewer = person("9840000071");
        answers(viewer, VIEWER);
        String own = room(viewer);
        String other = room(person("9840000072"));
        jdbc.update("update flatmate_rooms set created_at = now() - interval '1 day' where id = ?::uuid", own);
        em.clear();

        assertThat(ids(body(feed("move-in").param("sort", "match")
                .header(HttpHeaders.AUTHORIZATION, bearer(viewer))))).containsExactly(other, own);

        User thin = person("9840000073");
        answers(thin, "{\"tidy\":0,\"food\":1}");
        User author = person("9840000074");
        answers(author, VIEWER);
        String older = room(author);
        jdbc.update("update flatmate_rooms set created_at = now() - interval '1 day' where id = ?::uuid", older);
        em.clear();
        assertThat(ids(body(feed("move-in").param("sort", "match")
                .header(HttpHeaders.AUTHORIZATION, bearer(thin))))).first().isNotEqualTo(older);
    }
}

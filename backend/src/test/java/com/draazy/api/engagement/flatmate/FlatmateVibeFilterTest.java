package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("Flatmate board — the living-style `vibe` filter")
class FlatmateVibeFilterTest extends FlatmateStyleFixtures {

    private static final String VIEWER = "{\"food\":1,\"smoking\":1,\"pets\":1}";

    private MockHttpServletRequestBuilder feed(String tab, String... vibe) {
        MockHttpServletRequestBuilder request = get(Routes.Flatmates.FEED).param("tab", tab)
                .param("locality", TOWN).param("size", "50");
        return vibe.length == 0 ? request : request.param("vibe", vibe);
    }

    private List<String> ids(MockHttpServletRequestBuilder request, User viewer) throws Exception {
        if (viewer != null) {
            request.header(HttpHeaders.AUTHORIZATION, bearer(viewer));
        }
        String json = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.content[*].id");
    }

    private String roomOf(String mobile, String styleJson) throws Exception {
        User host = person(mobile);
        if (styleJson != null) {
            answers(host, styleJson);
        }
        return room(host);
    }

    private final class Board {
        final User viewer = person("9841500001");
        final String roomA;
        final String roomB;
        final String roomC;
        final String roomD;

        Board() throws Exception {
            answers(viewer, VIEWER);
            roomA = roomOf("9841500002", "{\"food\":0,\"smoking\":0}");
            roomB = roomOf("9841500003", "{\"food\":2,\"smoking\":0}");
            roomC = roomOf("9841500004", null);
            roomD = roomOf("9841500005", "{\"food\":0,\"smoking\":2}");
        }
    }

    @Test
    @DisplayName("an author's answer matches its token; an author who never answered the key is excluded")
    void matchesTheAuthorsAnswer() throws Exception {
        Board b = new Board();

        assertThat(ids(feed("move-in", "food:0"), b.viewer)).containsExactlyInAnyOrder(b.roomA, b.roomD);
        assertThat(ids(feed("move-in", "food:2"), b.viewer)).containsExactly(b.roomB);
        assertThat(ids(feed("move-in", "pets:0", "pets:1", "pets:2"), b.viewer)).isEmpty();
    }

    @Test
    @DisplayName("OR within a key, AND across keys, repeated or comma-separated")
    void orWithinAndAcross() throws Exception {
        Board b = new Board();

        assertThat(ids(feed("move-in", "food:0", "food:2"), b.viewer))
                .containsExactlyInAnyOrder(b.roomA, b.roomB, b.roomD);
        assertThat(ids(feed("move-in", "food:0", "smoking:0"), b.viewer)).containsExactly(b.roomA);
        assertThat(ids(feed("move-in", "food:0,smoking:0"), b.viewer)).containsExactly(b.roomA);
        assertThat(ids(feed("move-in", "food:0", "food:2", "smoking:2"), b.viewer)).containsExactly(b.roomD);
    }

    @Test
    @DisplayName("a guest's tokens are ignored, and so is a key the caller has not answered")
    void privacyRule() throws Exception {
        Board b = new Board();
        List<String> everyone = List.of(b.roomA, b.roomB, b.roomC, b.roomD);

        assertThat(ids(feed("move-in", "food:0"), null)).containsExactlyInAnyOrderElementsOf(everyone);
        assertThat(ids(feed("move-in", "drinks:0"), b.viewer)).containsExactlyInAnyOrderElementsOf(everyone);
        assertThat(ids(feed("move-in", "drinks:0", "food:2"), b.viewer)).containsExactly(b.roomB);
    }

    @Test
    @DisplayName("a caller with fewer than three answers cannot filter, as they could not see answers")
    void belowTheMatchThresholdNothingFilters() throws Exception {
        Board b = new Board();
        User twoAnswers = person("9841500006");
        answers(twoAnswers, "{\"food\":0,\"smoking\":0}");

        assertThat(ids(feed("move-in", "food:2"), twoAnswers))
                .containsExactlyInAnyOrder(b.roomA, b.roomB, b.roomC, b.roomD);
    }

    @Test
    @DisplayName("people and teams are matched on their author's answers too")
    void postsAndGroupsFollowTheirAuthors() throws Exception {
        User viewer = person("9841500011");
        answers(viewer, VIEWER);
        User veg = person("9841500012");
        answers(veg, "{\"food\":0}");
        User nonVeg = person("9841500013");
        answers(nonVeg, "{\"food\":2}");
        String vegPost = seekerPost(veg);
        String vegTeam = group(veg);
        seekerPost(nonVeg);
        group(nonVeg);

        assertThat(ids(feed("team-up", "food:0"), viewer)).containsExactlyInAnyOrder(vegPost, vegTeam);
        assertThat(ids(feed("people", "food:0"), viewer)).containsExactly(vegPost);
        assertThat(ids(feed("teams", "food:0"), viewer)).containsExactly(vegTeam);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"food", "food:3", "food:-1", "food:x", "tidy:0", "FOOD:0", "food:0:1", "food:00"})
    @DisplayName("a malformed token or a key outside the filter set is a 400, for guests too")
    void badTokensAreRejected(String token) throws Exception {
        mvc.perform(feed("move-in", token)).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("a legacy `tags` payload and `habits` param are ignored, not rejected")
    void legacyInputIsIgnored() throws Exception {
        User author = person("9841500021");
        String body = mvc.perform(post(Routes.Flatmates.POSTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Seeker","gender":"any","age":27,"budget":18000,
                                 "localities":["%s"],"moveIn":"2026-09-01","flatPref":"any",
                                 "roomPref":"private","tags":["Vegetarian"],"note":"Hello."}
                                """.formatted(TOWN)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.tags").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String id = approved("flatmate_seeker_posts", JsonPath.read(body, "$.id"));

        assertThat(ids(feed("people").param("habits", "Vegetarian"), null)).containsExactly(id);
    }
}
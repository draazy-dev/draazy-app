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

@DisplayName("Flatmate feed — shared vibes ride on the feed response")
class FlatmateSharedVibesTest extends FlatmateStyleFixtures {
    private static final String VIEWER = "{\"tidy\":0,\"food\":0,\"sleep\":2,\"wfh\":2,\"pets\":1}";

    private MockHttpServletRequestBuilder feed(String tab) {
        return get(Routes.Flatmates.FEED).param("tab", tab).param("locality", TOWN).param("size", "50");
    }

    private Map<String, List<Map<String, Object>>> shared(MockHttpServletRequestBuilder request) throws Exception {
        String json = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.sharedVibes");
    }

    private MockHttpServletRequestBuilder as(User viewer, String tab) {
        return feed(tab).header(HttpHeaders.AUTHORIZATION, bearer(viewer));
    }

    @Test
    @DisplayName("only equal answers are shared, strongest first, at most two")
    void topTwoSharedAnswers() throws Exception {
        User viewer = person("9841000001");
        answers(viewer, VIEWER);
        User author = person("9841000002");
        answers(author, "{\"tidy\":0,\"food\":0,\"sleep\":2,\"wfh\":2,\"pets\":0}");
        String room = room(author);

        List<Map<String, Object>> vibes = shared(as(viewer, "move-in")).get("room:" + room);

        assertThat(vibes).containsExactly(
                Map.of("key", "sleep", "answer", 2),
                Map.of("key", "food", "answer", 0));
    }

    @Test
    @DisplayName("a different answer is never reported, and a row with nothing in common is omitted")
    void differingAnswersAreNotShared() throws Exception {
        User viewer = person("9841000011");
        answers(viewer, VIEWER);
        User opposite = person("9841000012");
        answers(opposite, "{\"tidy\":2,\"food\":2,\"sleep\":0,\"wfh\":0,\"pets\":0}");
        String room = room(opposite);

        assertThat(shared(as(viewer, "move-in"))).doesNotContainKey("room:" + room);
    }

    @Test
    @DisplayName("an author's answer the viewer never gave cannot surface, even if it is the strongest")
    void unansweredKeysDoNotLeak() throws Exception {
        User viewer = person("9841000021");
        answers(viewer, "{\"tidy\":0,\"wfh\":2,\"pets\":1}");
        User author = person("9841000022");
        answers(author, "{\"sleep\":2,\"food\":0,\"smoking\":0,\"tidy\":0}");
        String room = room(author);

        List<Map<String, Object>> vibes = shared(as(viewer, "move-in")).get("room:" + room);

        assertThat(vibes).containsExactly(Map.of("key", "tidy", "answer", 0));
    }

    @Test
    @DisplayName("a guest and a viewer with fewer than three answers get none")
    void guestsAndThinViewersGetNothing() throws Exception {
        User author = person("9841000031");
        answers(author, VIEWER);
        room(author);
        User thin = person("9841000032");
        answers(thin, "{\"sleep\":2,\"food\":0}");

        assertThat(shared(feed("move-in"))).isEmpty();
        assertThat(shared(as(thin, "move-in"))).isEmpty();
        assertThat(shared(as(person("9841000033"), "move-in"))).isEmpty();
    }

    @Test
    @DisplayName("the viewer's own rows and authors without answers are omitted; seeker posts are keyed as post:")
    void ownRowsAndSilentAuthorsAreOmitted() throws Exception {
        User viewer = person("9841000041");
        answers(viewer, VIEWER);
        String own = room(viewer);
        String silent = room(person("9841000042"));
        User seeker = person("9841000043");
        answers(seeker, "{\"sleep\":2}");
        String post = seekerPost(seeker);

        Map<String, List<Map<String, Object>>> rooms = shared(as(viewer, "move-in"));
        assertThat(rooms).doesNotContainKeys("room:" + own, "room:" + silent);

        assertThat(shared(as(viewer, "people")).get("post:" + post))
                .containsExactly(Map.of("key", "sleep", "answer", 2));
    }
}

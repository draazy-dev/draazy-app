package com.draazy.api.engagement.flatmate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.identity.user.User;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

@DisplayName("GET /flatmates/{kind}/{id}/living-style")
class FlatmateLivingStyleEndpointsTest extends FlatmateStyleFixtures {

    private static final String MINE = "{\"tidy\":0,\"food\":1,\"sleep\":2,\"wfh\":2}";

    private static String route(String kind, String id) {
        return "/flatmates/" + kind + "/" + id + "/living-style";
    }

    @Test
    @DisplayName("a guest gets 401")
    void guestIsRefused() throws Exception {
        String room = room(person("9850000001"));
        mvc.perform(get(route("room", room))).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a signed-in caller sees the author's answers and the match, for every kind")
    void publicItemsExposeAnswers() throws Exception {
        User viewer = person("9850000011");
        answers(viewer, MINE);
        User author = person("9850000012");
        answers(author, "{\"tidy\":2,\"food\":0,\"sleep\":0,\"wfh\":0}");
        String[][] items = {{"room", room(author)}, {"group", group(author)}, {"post", seekerPost(author)}};

        for (String[] item : items) {
            mvc.perform(get(route(item[0], item[1])).header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.answers.tidy").value(2))
                    .andExpect(jsonPath("$.answers.wfh").value(0))
                    .andExpect(jsonPath("$.match").value(13))
                    .andExpect(jsonPath("$.common").value(4));
        }
    }

    @Test
    @DisplayName("match is null when the two share fewer than three answers; an author without answers gets an empty map")
    void thinOrMissingAnswers() throws Exception {
        User viewer = person("9850000021");
        answers(viewer, MINE);
        User thin = person("9850000022");
        answers(thin, "{\"tidy\":0,\"food\":1}");
        User silent = person("9850000023");
        String thinRoom = room(thin);
        String silentRoom = room(silent);

        mvc.perform(get(route("room", thinRoom)).header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.match").value(Matchers.nullValue()))
                .andExpect(jsonPath("$.common").value(2));
        mvc.perform(get(route("room", silentRoom)).header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers").isEmpty())
                .andExpect(jsonPath("$.match").value(Matchers.nullValue()))
                .andExpect(jsonPath("$.common").value(0));
    }

    @Test
    @DisplayName("a caller sees only the author's answers for keys the caller also answered")
    void answersAreReciprocal() throws Exception {
        User viewer = person("9850000061");
        answers(viewer, "{\"tidy\":0,\"food\":1,\"pets\":2}");
        User author = person("9850000062");
        answers(author, "{\"tidy\":2,\"food\":1,\"pets\":0,\"smoking\":0,\"quiet\":2}");
        String room = room(author);

        mvc.perform(get(route("room", room)).header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers.length()").value(3))
                .andExpect(jsonPath("$.answers.tidy").value(2))
                .andExpect(jsonPath("$.answers.food").value(1))
                .andExpect(jsonPath("$.answers.pets").value(0))
                .andExpect(jsonPath("$.answers.smoking").doesNotExist())
                .andExpect(jsonPath("$.answers.quiet").doesNotExist())
                .andExpect(jsonPath("$.common").value(3))
                .andExpect(jsonPath("$.match").value(33));
    }

    @Test
    @DisplayName("a caller with fewer than three answers gets nothing back, not even the keys they did answer")
    void callerWithTooFewAnswersSeesNothing() throws Exception {
        User author = person("9850000071");
        answers(author, MINE);
        String room = room(author);
        User none = person("9850000072");
        User two = person("9850000073");
        answers(two, "{\"tidy\":0,\"food\":1}");

        for (User caller : new User[] {none, two}) {
            mvc.perform(get(route("room", room)).header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.answers").isEmpty())
                    .andExpect(jsonPath("$.match").value(Matchers.nullValue()))
                    .andExpect(jsonPath("$.common").value(0));
        }
    }

    @Test
    @DisplayName("the author reads their own answers with no match")
    void authorSeesOwn() throws Exception {
        User author = person("9850000031");
        answers(author, MINE);
        String room = room(author);

        mvc.perform(get(route("room", room)).header(HttpHeaders.AUTHORIZATION, bearer(author)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.answers.sleep").value(2))
                .andExpect(jsonPath("$.match").value(Matchers.nullValue()));
    }

    @Test
    @DisplayName("an item awaiting moderation is 404 to a stranger and readable by its author")
    void pendingItemsFollowTheDetailRule() throws Exception {
        User stranger = person("9850000041");
        User author = person("9850000042");
        answers(author, MINE);
        String room = room(author);
        String post = seekerPost(author);
        jdbc.update("update flatmate_rooms set mod_status = 'pending' where id = ?::uuid", room);
        jdbc.update("update flatmate_seeker_posts set mod_status = 'pending' where id = ?::uuid", post);
        em.clear();

        for (String[] item : new String[][] {{"room", room}, {"post", post}}) {
            mvc.perform(get(route(item[0], item[1])).header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                    .andExpect(status().isNotFound());
            mvc.perform(get(route(item[0], item[1])).header(HttpHeaders.AUTHORIZATION, bearer(author)))
                    .andExpect(status().isOk());
        }
    }

    @Test
    @DisplayName("unknown kinds, unknown ids and a suspended author are 404")
    void unknownOrSuspended() throws Exception {
        User viewer = person("9850000051");
        User author = person("9850000052");
        String room = room(author);

        mvc.perform(get(route("flat", room)).header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound());
        mvc.perform(get(route("room", "00000000-0000-4000-8000-000000000000"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound());

        jdbc.update("update users set status = 'suspended' where id = ?", author.getId());
        em.clear();
        mvc.perform(get(route("room", room)).header(HttpHeaders.AUTHORIZATION, bearer(viewer)))
                .andExpect(status().isNotFound());
    }
}

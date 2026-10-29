package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import com.draazy.api.support.Races;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("Flatmate interests under concurrency — the cap D73 was raised against")
class FlatmateInterestRaceTest {
    private static final int CAP = 10;

    // Two racers, not three: the winner holds two of the four test connections (own + audit write).
    // A third would exhaust the pool and time out.
    private static final int RACERS = 2;

    @Autowired FlatmateSeekerService seekers;
    @Autowired FlatmateSeekerPostRepository posts;
    @Autowired FlatmateRequestRepository requests;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    private User requester;
    private final List<User> hosts = new ArrayList<>();
    private final List<UUID> postIds = new ArrayList<>();

    @BeforeEach
    void setUp() {
        requester = saveUser("9876000373", "Racer");
        for (int i = 0; i < RACERS; i++) {
            User host = saveUser("987600037" + (4 + i), "Host " + i);
            hosts.add(host);
            postIds.add(livePostFor(host));
        }
        for (int i = 0; i < CAP - 1; i++) {
            requests.saveAndFlush(new FlatmateRequest("flatmate", UUID.randomUUID(),
                    hosts.get(0).getId(), requester.getId(), "solo", "earlier"));
        }
        assertThat(countForRequester()).isEqualTo(CAP - 1);
    }

    @AfterEach
    void cleanUp() {
        List<UUID> everyone = new ArrayList<>(hosts.stream().map(User::getId).toList());
        if (requester != null) {
            everyone.add(requester.getId());
            jdbc.update("delete from flatmate_requests where requester_id = ?", requester.getId());
        }
        for (UUID hostId : hosts.stream().map(User::getId).toList()) {
            jdbc.update("delete from flatmate_requests where host_id = ?", hostId);
        }
        for (UUID postId : postIds) {
            jdbc.update("delete from audit_log where entity_id = ?", postId.toString());
            jdbc.update("delete from flatmate_seeker_posts where id = ?", postId);
        }
        for (UUID userId : everyone) {
            jdbc.update("delete from notifications where user_id = ?", userId);
            jdbc.update("delete from users where id = ?", userId);
        }
        hosts.clear();
        postIds.clear();
        requester = null;
    }

    private User saveUser(String mobile, String name) {
        User user = new User(mobile, Roles.Wire.BUYER);
        user.setName(name);
        user.setMobileVerified(true);
        return users.saveAndFlush(user);
    }

    private UUID livePostFor(User host) {
        FlatmateSeekerPost post = new FlatmateSeekerPost(host.getId(), host.getName(), 15_000L);
        post.setModStatus(FlatmateVocabulary.MOD_LIVE);
        return posts.saveAndFlush(post).getId();
    }

    private long countForRequester() {
        Long n = jdbc.queryForObject("select count(*) from flatmate_requests where requester_id = ?",
                Long.class, requester.getId());
        return n == null ? 0 : n;
    }

    @Test
    @DisplayName("two simultaneous interests fill the last slot once")
    void concurrentInterestsCannotOverfillTheHourlyCap() {
        AuthPrincipal caller = new AuthPrincipal(
                requester.getId(), Roles.Wire.BUYER, null, true, false);

        List<Throwable> outcomes = Races.run(RACERS, index ->
                seekers.express(caller, postIds.get(index), "solo", "Hello from racer " + index));

        for (Throwable outcome : outcomes) {
            if (outcome != null && !(outcome instanceof RateLimitedException)) {
                throw new AssertionError(
                        "a racer failed with something other than the business refusal", outcome);
            }
        }
        assertThat(outcomes.stream().filter(RateLimitedException.class::isInstance).count())
                .as("exactly one racer must be refused")
                .isEqualTo(RACERS - 1);
        assertThat(countForRequester())
                .as("every extra row here is one more stranger holding this person's number")
                .isEqualTo(CAP);
    }
}

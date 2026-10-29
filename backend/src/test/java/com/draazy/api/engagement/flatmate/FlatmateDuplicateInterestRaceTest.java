package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import com.draazy.api.support.Races;
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
@DisplayName("Two interests in the same post, sent together")
class FlatmateDuplicateInterestRaceTest {
    private static final int RACERS = 2;

    @Autowired FlatmateSeekerService seekers;
    @Autowired FlatmateSupplyService supply;
    @Autowired FlatmateSeekerPostRepository posts;
    @Autowired FlatmateRoomRepository rooms;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    private User requester;
    private User host;
    private UUID postId;
    private UUID roomId;

    @BeforeEach
    void setUp() {
        requester = saveUser("9876000380", "Duplicate Racer");
        host = saveUser("9876000381", "Duplicate Host");
        FlatmateSeekerPost post = new FlatmateSeekerPost(host.getId(), host.getName(), 15_000L);
        post.setModStatus(FlatmateVocabulary.MOD_LIVE);
        postId = posts.saveAndFlush(post).getId();
        FlatmateRoom room = new FlatmateRoom(host.getId(), "Private room", "Baner", 12_000L);
        room.setModStatus(FlatmateVocabulary.MOD_LIVE);
        roomId = rooms.saveAndFlush(room).getId();
    }

    @AfterEach
    void cleanUp() {
        if (requester != null) {
            jdbc.update("delete from flatmate_requests where requester_id = ?", requester.getId());
        }
        if (host != null) {
            jdbc.update("delete from flatmate_requests where host_id = ?", host.getId());
        }
        if (postId != null) {
            jdbc.update("delete from audit_log where entity_id = ?", postId.toString());
            jdbc.update("delete from flatmate_seeker_posts where id = ?", postId);
        }
        if (roomId != null) {
            jdbc.update("delete from audit_log where entity_id = ?", roomId.toString());
            jdbc.update("delete from flatmate_rooms where id = ?", roomId);
        }
        for (User user : new User[] { requester, host }) {
            if (user != null) {
                jdbc.update("delete from notifications where user_id = ?", user.getId());
                jdbc.update("delete from users where id = ?", user.getId());
            }
        }
        requester = null;
        host = null;
        postId = null;
        roomId = null;
    }

    private User saveUser(String mobile, String name) {
        User user = new User(mobile, Roles.Wire.BUYER);
        user.setName(name);
        user.setMobileVerified(true);
        return users.saveAndFlush(user);
    }

    private long countInterests(String kind, UUID targetId) {
        Long n = jdbc.queryForObject(
                "select count(*) from flatmate_requests"
                        + " where kind = ? and target_id = ? and requester_id = ?",
                Long.class, kind, targetId, requester.getId());
        return n == null ? 0 : n;
    }

    private void assertOneWinnerAndOneRefusal(List<Throwable> outcomes, String kind, UUID target) {
        for (Throwable outcome : outcomes) {
            if (outcome != null && !(outcome instanceof ConflictException)) {
                throw new AssertionError(
                        "a racer failed with something other than the business refusal", outcome);
            }
        }
        assertThat(outcomes.stream().filter(ConflictException.class::isInstance).count())
                .as("exactly one racer must lose the press")
                .isEqualTo(RACERS - 1);
        assertThat(outcomes.stream()
                .filter(ConflictException.class::isInstance)
                .map(Throwable::getMessage))
                .as("the refusal has to carry the code the contract declares, in the position the "
                        + "client's end-anchored parser reads it from (D182)")
                .allMatch(message -> message.endsWith("(already_interested)"));
        assertThat(countInterests(kind, target))
                .as("the index exists so that one press and two presses leave the same inbox")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("a seeker post: the loser is refused with a 409 rather than a 500")
    void concurrentInterestsInOnePostLeaveOneRow() {
        AuthPrincipal caller = new AuthPrincipal(
                requester.getId(), Roles.Wire.BUYER, null, true, false);

        List<Throwable> outcomes = Races.run(RACERS, index ->
                seekers.express(caller, postId, "solo", "Hello from racer " + index));

        assertOneWinnerAndOneRefusal(outcomes, "flatmate", postId);
    }

    @Test
    @DisplayName("a room: the loser is refused with a 409 rather than a 500")
    void concurrentInterestsInOneRoomLeaveOneRow() {
        AuthPrincipal caller = new AuthPrincipal(
                requester.getId(), Roles.Wire.BUYER, null, true, false);

        List<Throwable> outcomes = Races.run(RACERS, index ->
                supply.roomInterest(caller, roomId, "solo", "Hello from racer " + index, null));

        assertOneWinnerAndOneRefusal(outcomes, "room", roomId);
    }
}

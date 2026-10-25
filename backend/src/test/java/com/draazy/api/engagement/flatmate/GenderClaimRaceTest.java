package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.user.UserService;
import com.draazy.api.identity.user.UserUpdate;
import com.draazy.api.security.Roles;
import com.draazy.api.support.Races;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

// Commits for real: a first-claim race cannot be staged inside AbstractApiTest's single transaction.
@SpringBootTest
@DisplayName("Two first claims of a profile gender at once")
class GenderClaimRaceTest {

    @Autowired UserService userService;
    @Autowired FlatmateGenderGate gate;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;

    private UUID userId;

    @AfterEach
    void cleanUp() {
        if (userId != null) {
            jdbc.update("delete from users where id = ?", userId);
        }
    }

    private UUID freshUser(String mobile) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName("Race " + mobile);
        u.setMobileVerified(true);
        userId = users.saveAndFlush(u).getId();
        return userId;
    }

    private String storedGender() {
        return jdbc.queryForObject("select gender from users where id = ?", String.class, userId);
    }

    private static UserUpdate gender(String value) {
        return new UserUpdate(null, null, null, null, value, null, null, null, null, null);
    }

    @Test
    @DisplayName("PATCH /auth/me: one value wins and the other caller gets a 409")
    void profilePatchesDoNotOverwriteEachOther() {
        UUID id = freshUser("9876000701");
        String[] values = { "male", "female" };

        List<Throwable> outcomes = Races.run(2, i -> userService.updateMe(id, gender(values[i])));

        assertThat(outcomes.stream().filter(o -> o == null)).hasSize(1);
        assertThat(outcomes.stream().filter(o -> o != null))
                .singleElement().isInstanceOf(ConflictException.class);
        int winner = outcomes.get(0) == null ? 0 : 1;
        assertThat(storedGender()).isEqualTo(values[winner]);
    }

    @Test
    @DisplayName("room asks: a refused ask never saves its gender, so the woman's claim stands")
    void refusedAskDoesNotClaim() {
        UUID id = freshUser("9876000702");
        String[] values = { "male", "female" };

        List<Throwable> outcomes = Races.run(2, i -> tx.executeWithoutResult(
                s -> gate.admitToGroup(id, "women", values[i])));

        assertThat(storedGender()).isEqualTo("female");
        assertThat(outcomes.get(1)).isNull();
    }
}
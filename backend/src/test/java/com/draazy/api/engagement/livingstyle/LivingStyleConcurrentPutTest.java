package com.draazy.api.engagement.livingstyle;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.Races;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

// Not on AbstractApiTest: a first-PUT race only exists across commits.
@SpringBootTest
@DisplayName("Living style — concurrent first PUT and answer constraint")
class LivingStyleConcurrentPutTest {

    private static final String MOBILE = "9876000441";

    @Autowired LivingStyleService service;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    private User user;

    @BeforeEach
    void setUp() {
        wipe();
        User row = new User(MOBILE, "buyer");
        row.setMobileVerified(true);
        user = users.saveAndFlush(row);
    }

    @AfterEach
    void cleanUp() {
        wipe();
    }

    private void wipe() {
        jdbc.update("delete from user_living_style where user_id in (select id from users where mobile = ?)", MOBILE);
        jdbc.update("delete from users where mobile = ?", MOBILE);
    }

    @Test
    @DisplayName("simultaneous first PUTs all succeed and leave one row")
    void concurrentFirstPutsLeaveOneRow() {
        var outcomes = Races.run(6, index -> service.replace(user.getId(),
                new LivingStyleRequest(Map.of("tidy", index % 3, "food", 1))));

        assertThat(outcomes).containsOnlyNulls();
        assertThat(jdbc.queryForObject("select count(*) from user_living_style where user_id = ?",
                Integer.class, user.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("the table refuses an answer that is not a whole number from 0 to 2")
    void storageRefusesOutOfRangeAnswers() {
        for (String answers : new String[] {"{\"tidy\":3}", "{\"tidy\":-1}", "{\"tidy\":1.5}", "{\"tidy\":\"1\"}",
                "{\"tidy\":null}", "{\"tidy\":true}"}) {
            assertThatThrownBy(() -> jdbc.update(
                    "insert into user_living_style (user_id, answers) values (?, ?::jsonb)", user.getId(), answers))
                    .as(answers).isInstanceOf(DataIntegrityViolationException.class);
        }
    }
}

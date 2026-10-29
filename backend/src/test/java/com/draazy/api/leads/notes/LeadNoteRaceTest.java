package com.draazy.api.leads.notes;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
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
@DisplayName("Two saves of one lead note, sent together")
class LeadNoteRaceTest {
    private static final int RACERS = 2;

    private static final int RACE_ATTEMPTS = 8;

    private static final String LEAD_KEY = "number:11111111-2222-4333-8444-555555555555";

    private static final String RACE_OWNER_MOBILE = "9876000420";

    @Autowired LeadNoteService leadNotes;
    @Autowired LeadNoteRepository notes;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    private User owner;

    @BeforeEach
    void setUp() {
        jdbc.update("delete from lead_notes where owner_id in"
                + " (select id from users where mobile = ?)", RACE_OWNER_MOBILE);
        jdbc.update("delete from users where mobile = ?", RACE_OWNER_MOBILE);
        User row = new User(RACE_OWNER_MOBILE, "owner");
        row.setName("Race Owner");
        row.setMobileVerified(true);
        owner = users.saveAndFlush(row);
    }

    @AfterEach
    void cleanUp() {
        if (owner != null) {
            jdbc.update("delete from lead_notes where owner_id = ?", owner.getId());
            jdbc.update("delete from users where id = ?", owner.getId());
            owner = null;
        }
    }

    private void assertOneNoteAndNoErrors(List<Throwable> outcomes) {
        for (Throwable outcome : outcomes) {
            if (outcome != null) {
                throw new AssertionError(
                        "the loser of the upsert race must have its note written, not be told the"
                                + " row it is trying to create conflicts with itself", outcome);
            }
        }
        List<LeadNote> stored = notes.findByOwnerId(owner.getId());
        assertThat(stored)
                .as("the unique index exists so that two saves of one annotation leave one row")
                .hasSize(1);
        assertThat(stored.get(0).getNote())
                .as("and the surviving row holds one of the two texts, not a blank the retry lost")
                .isIn("Called, no answer", "Called, wants Sunday");
    }

    @Test
    @DisplayName("the loser's note is written, not refused as a conflict")
    void concurrentSavesOfOneNoteLeaveOneRow() {
        long before = leadNotes.racesRetried();
        for (int attempt = 1; attempt <= RACE_ATTEMPTS; attempt++) {
            UUID ownerId = owner.getId();
            List<Throwable> outcomes = Races.run(RACERS, index -> leadNotes.save(
                    ownerId, LEAD_KEY,
                    index == 0 ? "Called, no answer" : "Called, wants Sunday",
                    null));
            assertOneNoteAndNoErrors(outcomes);
            if (leadNotes.racesRetried() > before) {
                return;
            }
            jdbc.update("delete from lead_notes where owner_id = ?", owner.getId());
        }
        throw new AssertionError("two concurrent saves never collided in " + RACE_ATTEMPTS
                + " attempts, so the retry was never exercised — every attempt serialised, which"
                + " means this test no longer proves the fix works");
    }
}

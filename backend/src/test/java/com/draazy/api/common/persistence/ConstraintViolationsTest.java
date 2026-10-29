package com.draazy.api.common.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.SQLException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;

@DisplayName("D170 — a violation is matched by constraint name, and anything else is not ours")
class ConstraintViolationsTest {
    private static final String INDEX = "uq_conversations_pair_property";

    private static final String DUPLICATE_KEY =
            "ERROR: duplicate key value violates unique constraint \"" + INDEX + "\"\n"
                    + "  Detail: Key (seeker_id, owner_id, property_id)=(0f0e..., 1a2b..., 3c4d...)"
                    + " already exists.";

    private static final String FOREIGN_KEY =
            "ERROR: insert or update on table \"conversations\" violates foreign key constraint "
                    + "\"conversations_property_id_fkey\"\n"
                    + "  Detail: Key (property_id)=(3c4d...) is not present in table \"properties\".";

    @Test
    @DisplayName("the collision the write was guarding against is recognised")
    void theExpectedConstraintMatches() {
        assertThat(ConstraintViolations.isOn(violation(DUPLICATE_KEY), INDEX)).isTrue();
    }

    @Test
    @DisplayName("a foreign key failure on the same table is not ours")
    void aForeignKeyFailureIsNotOurs() {
        assertThat(ConstraintViolations.isOn(violation(FOREIGN_KEY), INDEX)).isFalse();
    }

    @Test
    @DisplayName("a different unique index on the same table is not ours either")
    void anotherUniqueIndexIsNotOurs() {
        String other = DUPLICATE_KEY.replace(INDEX, "uq_conversations_pair_general");

        assertThat(ConstraintViolations.isOn(violation(other), INDEX)).isFalse();
    }

    @Test
    @DisplayName("a cause with no message is not a match")
    void aMessagelessCauseIsNotAMatch() {
        DataIntegrityViolationException violation =
                new DataIntegrityViolationException("could not execute statement",
                        new SQLException((String) null, "23505"));

        assertThat(ConstraintViolations.isOn(violation, INDEX)).isFalse();
    }

    @Test
    @DisplayName("a violation with no nested cause is handled, not thrown on")
    void aCauselessViolationIsHandled() {
        assertThat(ConstraintViolations.isOn(new DataIntegrityViolationException(INDEX), INDEX))
                .isTrue();
        assertThat(ConstraintViolations.isOn(new DataIntegrityViolationException("boom"), INDEX))
                .isFalse();
    }

    private static DataIntegrityViolationException violation(String driverMessage) {
        return new DataIntegrityViolationException("could not execute statement",
                new SQLException(driverMessage, "23505"));
    }
}

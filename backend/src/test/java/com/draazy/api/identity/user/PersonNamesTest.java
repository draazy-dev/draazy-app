package com.draazy.api.identity.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validation;
import org.junit.jupiter.api.Test;

class PersonNamesTest {

    private final PersonNames names = new PersonNames(Validation.buildDefaultValidatorFactory().getValidator());

    @Test
    void acceptsWhatSelfServiceAcceptsAndStrips() {
        assertThat(names.require("  Asha R. Patil ")).isEqualTo("Asha R. Patil");
        assertThat(names.require("आशा पाटील")).isEqualTo("आशा पाटील");
        assertThat(names.require("D'Souza-Rao")).isEqualTo("D'Souza-Rao");
    }

    @Test
    void refusesWhatSelfServiceRefuses() {
        for (String bad : new String[] {"A", "Asha 123", "1Asha", "Asha<script>", "x".repeat(81)}) {
            assertThatThrownBy(() -> names.require(bad)).as(bad).isInstanceOf(ConstraintViolationException.class);
        }
    }

    @Test
    void reportsTheNameField() {
        assertThatThrownBy(() -> names.require("Asha 123")).isInstanceOfSatisfying(ConstraintViolationException.class,
                e -> assertThat(e.getConstraintViolations()).singleElement()
                        .satisfies(v -> assertThat(v.getPropertyPath().toString()).isEqualTo("name")));
    }
}

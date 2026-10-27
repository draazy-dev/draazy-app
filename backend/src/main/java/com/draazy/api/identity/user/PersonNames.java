package com.draazy.api.identity.user;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import org.springframework.stereotype.Component;

/** The name rule of {@link UserUpdate}, for the staff paths that set a user's name without that DTO. Reusing the
 * annotations keeps one definition and the same field-level 422 the self-service form gets. */
@Component
public class PersonNames {

    private final Validator validator;

    public PersonNames(Validator validator) {
        this.validator = validator;
    }

    public String require(String name) {
        String stripped = name.strip();
        var violations = validator.validateValue(UserUpdate.class, "name", stripped);
        if (!violations.isEmpty()) {
            throw new ConstraintViolationException(violations);
        }
        return stripped;
    }
}
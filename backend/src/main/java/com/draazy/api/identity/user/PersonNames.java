package com.draazy.api.identity.user;

import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import org.springframework.stereotype.Component;

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
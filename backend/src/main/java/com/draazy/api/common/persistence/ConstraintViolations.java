package com.draazy.api.common.persistence;

import org.springframework.dao.DataIntegrityViolationException;

public final class ConstraintViolations {
    private ConstraintViolations() {
    }

    public static boolean isOn(DataIntegrityViolationException violation, String constraintName) {
        String cause = violation.getMostSpecificCause().getMessage();
        return cause != null && cause.contains(constraintName);
    }
}

package com.draazy.api.deals.visit;

// Visits are in person only. The visits.mode CHECK still admits 'video'; PATTERN is what refuses it.
public final class VisitModes {

    private VisitModes() {
    }

    public static final String IN_PERSON = "in-person";

    public static final String PATTERN = IN_PERSON;
}

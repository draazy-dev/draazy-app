package com.draazy.api.catalog.property;

public final class PropertyPossession {
    private PropertyPossession() {
    }

    public static final String READY_TO_MOVE = "ready-to-move";

    public static final String NEW_LAUNCH = "new-launch";

    public static final String UNDER_CONSTRUCTION = "under-construction";

    public static final String PATTERN = READY_TO_MOVE + "|" + NEW_LAUNCH + "|" + UNDER_CONSTRUCTION;

    public static final String PATTERN_MESSAGE =
            "must be ready-to-move, new-launch or under-construction";

    public static final String UNMATCHABLE = "no.such.possession";
}

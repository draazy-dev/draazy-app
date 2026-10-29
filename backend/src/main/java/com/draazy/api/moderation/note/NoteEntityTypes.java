package com.draazy.api.moderation.note;

public final class NoteEntityTypes {
    private NoteEntityTypes() {
    }

    public static final String PROPERTY = "property";

    public static final String USER = "user";

    public static final String REVIEW = "review";

    public static final String REPORT = "report";

    public static final String SERVICE_REQUEST = "service_request";

    public static boolean isValid(String value) {
        return PROPERTY.equals(value) || USER.equals(value) || REVIEW.equals(value)
                || REPORT.equals(value) || SERVICE_REQUEST.equals(value);
    }
}

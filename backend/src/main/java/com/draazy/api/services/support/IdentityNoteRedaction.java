package com.draazy.api.services.support;

import java.util.List;
import java.util.regex.Pattern;

/** Strips anything shaped like an ID or phone number from free text a user typed about their identity. */
final class IdentityNoteRedaction {

    private static final List<Pattern> SENSITIVE_NUMBERS = List.of(
            Pattern.compile("(?i)(?:\\d[\\s-]?){8,}"),
            Pattern.compile("(?i)\\b[a-z]{5}[\\s-]?\\d{4}[\\s-]?[a-z]\\b"),
            Pattern.compile("(?i)\\b[a-z][\\s-]?\\d{7}\\b"),
            Pattern.compile("(?i)\\b[a-z]{3}[\\s-]?\\d{7}\\b"));

    private IdentityNoteRedaction() {
    }

    static String redact(String note) {
        String redacted = note;
        for (Pattern pattern : SENSITIVE_NUMBERS) {
            redacted = pattern.matcher(redacted).replaceAll("[redacted]");
        }
        return redacted;
    }
}

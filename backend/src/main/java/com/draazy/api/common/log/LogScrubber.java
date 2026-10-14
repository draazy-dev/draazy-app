package com.draazy.api.common.log;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Removes personal data and credentials from free text before it is stored. Pure and null-safe. */
public final class LogScrubber {

    private static final Pattern UUID = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern QUERY = Pattern.compile("(?<=[\\w/.~%-])\\?[^\\s\"'<>]+");
    private static final Pattern FRAGMENT = Pattern.compile("(?<=/[\\w./~%-]{0,200})#[^\\s\"'<>]+");
    private static final Pattern SECRET_PAIR = Pattern.compile("(?i)(?:\\b|(?<=_))"
            + "(password|passwd|pwd|secret|token|api[_-]?key|authorization|otp)([\"']?\\s*[=:]\\s*[\"']?)[^\\s&,;\"']+");
    private static final Pattern BEARER = Pattern.compile("(?i)\\bBearer\\s+[A-Za-z0-9._~+/=-]+");
    // The lookbehinds anchor each match at the start of a run; without them a long run is re-scanned from every
    // position, which is quadratic on attacker-sized input.
    private static final Pattern JWT = Pattern.compile(
            "(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{4,}\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*");
    private static final Pattern EMAIL = Pattern.compile(
            "(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}");
    // Postgres constraint errors quote whole row and key values, which can be names and addresses.
    private static final Pattern DB_ROW = Pattern.compile("(?s)(Failing row contains \\().*");
    private static final Pattern DB_KEY = Pattern.compile("(?s)(Key \\((?:[^()\\n]|\\([^()\\n]*\\)){0,200}\\)=\\().*");
    private static final Pattern MOBILE = Pattern.compile(
            "(?<!\\d)(?:\\+91[\\s-]?|91[\\s-]?|0)?[6-9]\\d{4}[\\s-]?\\d{5}(?!\\d)");
    private static final Pattern AADHAAR = Pattern.compile("(?<![\\d-])\\d{4}[ -]?\\d{4}[ -]?\\d{4}(?![\\d-])");
    private static final Pattern PAN = Pattern.compile("\\b[A-Z]{5}[0-9]{4}[A-Z]\\b");
    private static final Pattern LONG_DIGITS = Pattern.compile("(?<!\\d)\\d{10,}(?!\\d)");
    private static final Pattern LONG_RUN = Pattern.compile(
            "(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{32,}(?![A-Za-z0-9+/_=-])");

    private LogScrubber() {
    }

    /** UUIDs are ids, not secrets, and are what an operator searches by, so they pass through intact, unless they sit
     * in a query string or after a secret's name; those rules run on the whole text, before the UUID split. */
    public static String scrub(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String safe = DB_ROW.matcher(text).replaceAll("$1[row])");
        safe = DB_KEY.matcher(safe).replaceAll("$1[value])");
        safe = QUERY.matcher(safe).replaceAll("");
        safe = FRAGMENT.matcher(safe).replaceAll("");
        safe = BEARER.matcher(safe).replaceAll("[token]");
        safe = SECRET_PAIR.matcher(safe).replaceAll("$1$2[token]");
        StringBuilder out = new StringBuilder(safe.length());
        Matcher uuid = UUID.matcher(safe);
        int from = 0;
        while (uuid.find()) {
            out.append(scrubSegment(safe.substring(from, uuid.start()))).append(uuid.group());
            from = uuid.end();
        }
        return out.append(scrubSegment(safe.substring(from))).toString();
    }

    /** Cuts with headroom, scrubs, then truncates to {@code max}: the scrub never runs over an unbounded string. */
    public static String scrub(String text, int max) {
        int headroom = max * 2 + 200;
        String out = scrub(text == null || text.length() <= headroom ? text : text.substring(0, headroom));
        return out == null || out.length() <= max ? out : out.substring(0, max);
    }

    private static String scrubSegment(String text) {
        String out = JWT.matcher(text).replaceAll("[token]");
        out = EMAIL.matcher(out).replaceAll("[email]");
        out = MOBILE.matcher(out).replaceAll("[number]");
        out = AADHAAR.matcher(out).replaceAll("[aadhaar]");
        out = PAN.matcher(out).replaceAll("[pan]");
        out = LONG_DIGITS.matcher(out).replaceAll("[number]");
        return LONG_RUN.matcher(out).replaceAll(match -> Matcher.quoteReplacement(longRun(match.group())));
    }

    // A digit is required so a long identifier such as a class name is not mistaken for a secret.
    private static String longRun(String run) {
        return run.chars().anyMatch(Character::isDigit) ? "[token]" : run;
    }
}

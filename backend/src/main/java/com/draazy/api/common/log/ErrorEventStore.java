package com.draazy.api.common.log;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** Writes {@code error_event}: one row per fingerprint, counted rather than repeated. */
@Component
public class ErrorEventStore {

    public static final int MAX_MESSAGE = 1_000;
    public static final int MAX_STACK = 16_000;

    private static final ObjectMapper JSON = JsonMapper.builder().build();
    private static final Pattern UUIDS = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final Pattern DIGITS = Pattern.compile("\\d+");
    private static final int FINGERPRINT_MESSAGE = 200;

    // A server repeat refreshes the row and reopens it if resolved (the fix did not hold). A browser repeat, which
    // anyone can send, only counts and records its support reference (a validated UUID); the rest stays as first seen.
    private static final String UPSERT = """
            INSERT INTO error_event (fingerprint, source, error_type, message, stack, path, http_method,
                                     http_status, build, user_role, last_user_id, last_trace_id, context)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
            ON CONFLICT (fingerprint) DO UPDATE SET
                occurrences = error_event.occurrences + 1,
                last_seen = now(),
                last_trace_id = EXCLUDED.last_trace_id,
                last_user_id = EXCLUDED.last_user_id,
                user_role = EXCLUDED.user_role,
                http_status = EXCLUDED.http_status,
                build = CASE WHEN error_event.source = 'web' THEN error_event.build ELSE EXCLUDED.build END,
                context = CASE WHEN error_event.source = 'web'
                    THEN error_event.context || jsonb_strip_nulls(jsonb_build_object('reference',
                                                                                    EXCLUDED.context -> 'reference'))
                    ELSE EXCLUDED.context END,
                resolved_at = CASE WHEN error_event.source = 'web' THEN error_event.resolved_at END,
                resolved_by = CASE WHEN error_event.source = 'web' THEN error_event.resolved_by END""";

    /** Every field already scrubbed and capped by the caller. */
    public record Capture(String fingerprint, String source, String errorType, String message, String stack,
            String path, String httpMethod, Integer httpStatus, String build, String userRole, UUID userId,
            String traceId, Map<String, Object> context) {
    }

    private final JdbcTemplate jdbc;

    public ErrorEventStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void record(Capture c) {
        jdbc.update(UPSERT, c.fingerprint(), c.source(), c.errorType(), c.message(), c.stack(), c.path(),
                c.httpMethod(), c.httpStatus(), c.build(), c.userRole(), c.userId(), c.traceId(),
                JSON.writeValueAsString(c.context()));
    }

    /** Digits and UUIDs collapse so the same fault with a different id is still one row. */
    public static String normalise(String message) {
        if (message == null) {
            return "";
        }
        String out = DIGITS.matcher(UUIDS.matcher(message).replaceAll("<id>")).replaceAll("<n>");
        return out.length() <= FINGERPRINT_MESSAGE ? out : out.substring(0, FINGERPRINT_MESSAGE);
    }

    public static String fingerprint(String... parts) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(String.join("|", parts).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}

package com.draazy.api.engagement.clienterror;

import com.draazy.api.common.log.ErrorEventStore;
import com.draazy.api.common.log.LogScrubber;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.WriteRateLimitStore;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/** Scrubs, caps and dedupes browser error reports into {@code error_event}. Never reveals dedup to the caller. */
@Service
public class ClientErrorService {

    static final int NEW_FINGERPRINTS_PER_DAY = 200;
    static final int NEW_ANONYMOUS_PER_DAY = 150;
    static final int MAX_WEB_ROWS = 1_000;
    static final int NEW_PER_CALLER_PER_DAY = 5;

    private static final Logger log = LoggerFactory.getLogger(ClientErrorService.class);
    private static final Pattern SAFE_TRACE_ID = Pattern.compile("[A-Za-z0-9_-]{1,128}");
    private static final Pattern POSITIONS = Pattern.compile("(?::\\d+)+");
    private static final int MAX_SHORT = 100;
    private static final int MAX_PATH = 300;
    private static final int MAX_STACK = 8_000;
    private static final int MAX_COMPONENT_STACK = 2_000;

    private final ErrorEventStore store;
    private final JdbcTemplate jdbc;
    private final WriteRateLimitStore perCaller;
    private volatile LocalDate lastRefusalLogged;

    public ClientErrorService(ErrorEventStore store, JdbcTemplate jdbc, WriteRateLimitStore.Factory stores) {
        this.store = store;
        this.jdbc = jdbc;
        this.perCaller = stores.create("ce", NEW_PER_CALLER_PER_DAY, Duration.ofDays(1));
    }

    /** {@code callerKey} names the reporter: a user id when signed in, else the client address. */
    public void record(ClientErrorRequest body, AuthPrincipal principal, String callerKey) {
        String name = LogScrubber.scrub(body.name(), MAX_SHORT);
        String message = LogScrubber.scrub(body.message(), ErrorEventStore.MAX_MESSAGE);
        String stack = LogScrubber.scrub(body.stack(), MAX_STACK);
        String fingerprint = ErrorEventStore.fingerprint("web", String.valueOf(name),
                ErrorEventStore.normalise(message), firstFrame(stack));

        String reference = body.reference().toLowerCase();
        String lastTraceId = body.lastTraceId() != null && SAFE_TRACE_ID.matcher(body.lastTraceId()).matches()
                ? body.lastTraceId() : null;
        Map<String, Object> context = context(body, lastTraceId == null ? null : reference);

        try {
            if (!exists(fingerprint) && !admitNew(callerKey, principal == null)) {
                return;
            }
            store.record(new ErrorEventStore.Capture(fingerprint, "web", name, message, stack,
                    LogScrubber.scrub(path(body.path()), MAX_PATH), null, null,
                    LogScrubber.scrub(body.build(), 64), principal == null ? null : principal.role(),
                    principal == null ? null : principal.userId(),
                    lastTraceId != null ? lastTraceId : reference, context));
        } catch (RuntimeException e) {
            log.warn("Could not record a client error: {}", e.getClass().getSimpleName());
        }
    }

    private boolean exists(String fingerprint) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM error_event WHERE fingerprint = ?)", Boolean.class, fingerprint));
    }

    // One caller's own budget comes first, so a few addresses cannot spend the shared caps; part of the daily cap
    // is held back for signed-in users.
    private boolean admitNew(String callerKey, boolean anonymous) {
        String refusal = perCaller.tryAcquire(callerKey, Instant.now()) > 0 ? "this caller's daily budget"
                : !roomForNewWebError(anonymous ? NEW_ANONYMOUS_PER_DAY : NEW_FINGERPRINTS_PER_DAY) ? "the shared cap"
                : null;
        if (refusal != null && !LocalDate.now().equals(lastRefusalLogged)) {
            lastRefusalLogged = LocalDate.now();
            log.warn("Dropping new browser error reports today: {} is spent", refusal);
        }
        return refusal == null;
    }

    private boolean roomForNewWebError(int dailyCap) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE first_seen > now() - interval '1 day') < ? AND count(*) < ?
                FROM error_event WHERE source = 'web'
                """, Boolean.class, dailyCap, MAX_WEB_ROWS));
    }

    private static Map<String, Object> context(ClientErrorRequest body, String reference) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("kind", body.kind());
        put(out, "scope", LogScrubber.scrub(body.scope(), MAX_SHORT));
        put(out, "componentStack", LogScrubber.scrub(body.componentStack(), MAX_COMPONENT_STACK));
        put(out, "reference", reference);
        ClientErrorRequest.Context client = body.context();
        if (client != null) {
            put(out, "viewport", LogScrubber.scrub(client.viewport(), MAX_SHORT));
            put(out, "online", client.online());
            put(out, "userAgent", LogScrubber.scrub(client.userAgent(), MAX_SHORT));
            put(out, "deployEnv", LogScrubber.scrub(client.deployEnv(), MAX_SHORT));
        }
        return out;
    }

    private static void put(Map<String, Object> out, String key, Object value) {
        if (value != null) {
            out.put(key, value);
        }
    }

    // Query and fragment are dropped: the page URL can carry a share token.
    private static String path(String raw) {
        int cut = raw.indexOf('?');
        int hash = raw.indexOf('#');
        int end = cut < 0 ? hash : hash < 0 ? cut : Math.min(cut, hash);
        return end < 0 ? raw : raw.substring(0, end);
    }

    // Line and column move with every build, so they are left out of the identity of a crash.
    private static String firstFrame(String stack) {
        if (stack == null) {
            return "";
        }
        for (String line : stack.split("\n")) {
            String frame = line.strip();
            if (frame.startsWith("at ") || frame.contains("@")) {
                return POSITIONS.matcher(frame).replaceAll("");
            }
        }
        return "";
    }
}

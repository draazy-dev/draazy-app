package com.draazy.api.common.web;

import java.util.Locale;
import java.util.Set;

// /documents/shared?token=… is a bearer credential, and URLs are the most-copied part of a request. Log hygiene
// only, not authz: a denylist of credential names, matched on the raw name so %74oken only leaks the caller's own.
public final class LogSafeUri {

    private LogSafeUri() {
    }

    /** What a masked value is replaced with. Constant so tests and greps agree on one spelling. */
    public static final String REDACTED = "REDACTED";

    // Lower-case; matched case-insensitively. Beyond the share token, these are the OAuth and signed-URL
    // shapes, listed up front because a string is cheap and noticing later is an incident.
    static final Set<String> SENSITIVE = Set.of(
            "token", "access_token", "refresh_token", "id_token", "code", "signature", "sig",
            "secret", "password", "otp", "api_key", "apikey");

    /** Masks only sensitive values; path, names and other values stay, so the line remains debuggable. */
    public static String redact(String uri) {
        if (uri == null) {
            return null;
        }
        int queryStart = uri.indexOf('?');
        if (queryStart < 0 || queryStart == uri.length() - 1) {
            return uri;
        }

        String query = uri.substring(queryStart + 1);
        StringBuilder out = new StringBuilder(uri.length())
                .append(uri, 0, queryStart + 1);
        String[] pairs = query.split("&", -1);
        for (int i = 0; i < pairs.length; i++) {
            if (i > 0) {
                out.append('&');
            }
            String pair = pairs[i];
            int equals = pair.indexOf('=');
            // A name with no `=` has no value to leak, so it is passed through untouched.
            if (equals >= 0 && SENSITIVE.contains(
                    pair.substring(0, equals).toLowerCase(Locale.ROOT))) {
                out.append(pair, 0, equals + 1).append(REDACTED);
            } else {
                out.append(pair);
            }
        }
        return out.toString();
    }
}

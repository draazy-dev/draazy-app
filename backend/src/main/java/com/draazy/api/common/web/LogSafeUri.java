package com.draazy.api.common.web;

import java.util.Locale;
import java.util.Set;

// Share-link tokens are bearer credentials, so credential-named params are redacted.
// Log hygiene only, not authz; matched on the raw name so %74oken leaks only the caller's own.
public final class LogSafeUri {
    private LogSafeUri() {
    }

    public static final String REDACTED = "REDACTED";

    static final Set<String> SENSITIVE = Set.of(
            "token", "access_token", "refresh_token", "id_token", "code", "signature", "sig",
            "secret", "password", "otp", "api_key", "apikey");

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

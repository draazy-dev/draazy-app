package com.draazy.api.billing.referral;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class ReferralSignals {
    public static final String DEVICE_ID_HEADER = "X-Device-Id";

    private static final int MAX_DEVICE_ID_LENGTH = 64;

    private static final String ALGORITHM = "SHA-256";

    private static final int IPV6_PREFIX_BYTES = 8;

    private static final String SEPARATOR = "\u0000";

    private final String salt;

    public ReferralSignals(@Value("${draazy.security.referral-signal-salt}") String salt) {
        // @Value, not @ConfigurationProperties: the binder would bind an unset variable as a literal
        // placeholder and every deployment would share one well-known salt.
        this.salt = salt;
    }

    public Signals of(HttpServletRequest request) {
        if (request == null) {
            return Signals.NONE;
        }
        return new Signals(
                hash(collapse(request.getRemoteAddr())),
                hash(blankToNull(request.getHeader("User-Agent"))),
                hash(deviceId(request.getHeader(DEVICE_ID_HEADER))));
    }

    public static boolean matches(String stored, String observed) {
        return stored != null && stored.equals(observed);
    }

    public String deviceIdHash(String header) {
        return hash(deviceId(header));
    }

    public String instrumentHash(String instrument) {
        String trimmed = blankToNull(instrument);
        return trimmed == null ? null : hash("instrument" + SEPARATOR + trimmed.toLowerCase(java.util.Locale.ROOT));
    }

    public record Signals(String ipHash, String deviceHash, String deviceIdHash) {
        public static final Signals NONE = new Signals(null, null, null);
    }

    private static String deviceId(String header) {
        String trimmed = blankToNull(header);
        return trimmed == null || trimmed.length() > MAX_DEVICE_ID_LENGTH ? null : trimmed;
    }

    private String hash(String value) {
        if (value == null) {
            return null;
        }
        try {
            MessageDigest digest = MessageDigest.getInstance(ALGORITHM);
            return HexFormat.of().formatHex(
                    digest.digest((salt + SEPARATOR + value).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(ALGORITHM + " unavailable", impossible);
        }
    }

    private static String collapse(String address) {
        String trimmed = blankToNull(address);
        if (trimmed == null || trimmed.indexOf(':') < 0) {
            return trimmed;
        }
        try {
            byte[] bytes = InetAddress.getByName(trimmed).getAddress();
            if (bytes.length != 16) {
                return trimmed;
            }
            return HexFormat.of().formatHex(Arrays.copyOf(bytes, IPV6_PREFIX_BYTES));
        } catch (UnknownHostException notAnAddress) {
            return trimmed;
        }
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}

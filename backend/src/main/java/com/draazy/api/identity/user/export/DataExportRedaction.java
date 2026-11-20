package com.draazy.api.identity.user.export;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class DataExportRedaction {
    private static final String DOMAIN = "draazy:data-export:v1:";

    private static final int REF_LENGTH = 16;

    static final String SELF = "self";

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private DataExportRedaction() {
    }

    // party_ref_src is consumed and replaced, never added alongside, so the raw value cannot
    // reach the response.
    static Map<String, Object> row(Map<String, Object> raw, UUID subjectId) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : raw.entrySet()) {
            if (DataExportScope.PARTY_REF_SOURCE.equals(entry.getKey())) {
                out.put(DataExportScope.PARTY_REF, partyRef(entry.getValue(), subjectId));
            } else {
                out.put(entry.getKey(), value(entry.getValue()));
            }
        }
        return out;
    }

    static String partyRef(Object source, UUID subjectId) {
        if (source == null) {
            return null;
        }
        String key = String.valueOf(source).trim();
        if (key.isEmpty()) {
            return null;
        }
        if (key.equalsIgnoreCase(subjectId.toString())) {
            return SELF;
        }
        return digest(DOMAIN + subjectId + ':' + key);
    }

    static Object value(Object raw) {
        return switch (raw) {
            case null -> null;
            // Timestamp and Date both extend java.util.Date; the more specific arms must come first.
            case Timestamp ts -> ts.toInstant().toString();
            case Date d -> d.toLocalDate().toString();
            case Time t -> t.toLocalTime().toString();
            case UUID id -> id.toString();
            case String s -> s;
            case Boolean b -> b;
            case Number n -> n;
            default -> unwrap(raw);
        };
    }

    private static Object unwrap(Object raw) {
        String text = String.valueOf(raw);
        if (!raw.getClass().getName().equals("org.postgresql.util.PGobject")) {
            return text;
        }
        try {
            JsonNode parsed = JSON.readTree(text);
            return parsed == null || parsed.isMissingNode() ? text : parsed;
        } catch (RuntimeException e) {
            return text;
        }
    }

    private static String digest(String input) {
        try {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] hash = sha.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash).substring(0, REF_LENGTH);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is required by the JLS and is absent", e);
        }
    }
}

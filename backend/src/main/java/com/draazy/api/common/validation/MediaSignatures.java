package com.draazy.api.common.validation;

import java.nio.charset.StandardCharsets;
import java.util.Set;

public final class MediaSignatures {
    private MediaSignatures() {
    }

    public static final String PDF = "application/pdf";
    public static final String JPEG = "image/jpeg";
    public static final String PNG = "image/png";
    public static final String HEIC = "image/heic";
    public static final String WEBP = "image/webp";

    private static final Set<String> HEIF_BRANDS = Set.of(
            "heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs", "mif1", "msf1");

    private static final int SNIFF_BYTES = 12;

    public static String sniff(byte[] b) {
        if (b == null || b.length < 4) {
            return null;
        }
        if (starts(b, '%', 'P', 'D', 'F', '-')) {
            return PDF;
        }
        if (matches(b, 0xFF, 0xD8, 0xFF)) {
            return JPEG;
        }
        if (matches(b, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) {
            return PNG;
        }
        if (b.length >= SNIFF_BYTES && starts(b, 'R', 'I', 'F', 'F') && ascii(b, 8, 4).equals("WEBP")) {
            return WEBP;
        }
        if (b.length >= SNIFF_BYTES && ascii(b, 4, 4).equals("ftyp")
                && HEIF_BRANDS.contains(ascii(b, 8, 4))) {
            return HEIC;
        }
        return null;
    }

    public static String normalise(String contentType) {
        return contentType == null ? "" : contentType.split(";", 2)[0].trim().toLowerCase();
    }

    private static boolean starts(byte[] b, char... chars) {
        if (b.length < chars.length) {
            return false;
        }
        for (int i = 0; i < chars.length; i++) {
            if (b[i] != (byte) chars[i]) {
                return false;
            }
        }
        return true;
    }

    private static boolean matches(byte[] b, int... unsigned) {
        if (b.length < unsigned.length) {
            return false;
        }
        for (int i = 0; i < unsigned.length; i++) {
            if ((b[i] & 0xFF) != unsigned[i]) {
                return false;
            }
        }
        return true;
    }

    private static String ascii(byte[] b, int from, int length) {
        return new String(b, from, length, StandardCharsets.US_ASCII);
    }

    public static String safeFileName(String raw, String fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String base = raw.replace('\\', '/');
        base = base.substring(base.lastIndexOf('/') + 1);
        base = base.replaceAll("[^A-Za-z0-9._-]", "_");
        return base.length() > 120 ? base.substring(base.length() - 120) : base;
    }
}

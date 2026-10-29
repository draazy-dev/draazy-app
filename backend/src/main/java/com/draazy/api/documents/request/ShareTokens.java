package com.draazy.api.documents.request;

import java.security.SecureRandom;
import java.util.Base64;

public final class ShareTokens {
    private ShareTokens() {
    }

    public static final String HEADER = "X-Share-Token";

    private static final SecureRandom RANDOM = new SecureRandom();

    public static String mint() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}

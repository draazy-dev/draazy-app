package com.draazy.api.identity.auth;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.draazy.api.identity.user.SessionUser;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record AuthResponse(
        String accessToken,
        @JsonIgnore String refreshToken,
        String tokenType,
        Long expiresIn,
        SessionUser user,
        Boolean otpSent,
        Integer resendAfterSeconds,
        String mfa,
        String challenge,
        List<String> recoveryCodes) {
    public static final String MFA_TOTP = "totp";

    public static final String MFA_ENROL = "enrol";

    public static AuthResponse tokens(String accessToken, String refreshToken, long expiresInSeconds,
            SessionUser user) {
        return new AuthResponse(accessToken, refreshToken, "Bearer", expiresInSeconds, user, null,
                null, null, null, null);
    }

    public static AuthResponse otpAck(int resendAfterSeconds) {
        return new AuthResponse(null, null, null, null, null, Boolean.TRUE, resendAfterSeconds, null,
                null, null);
    }

    public static AuthResponse secondFactor(String mfa, String challenge) {
        return new AuthResponse(null, null, null, null, null, null, null, mfa, challenge, null);
    }

    public AuthResponse withRecoveryCodes(List<String> codes) {
        return new AuthResponse(accessToken, refreshToken, tokenType, expiresIn, user, otpSent,
                resendAfterSeconds, mfa, challenge, List.copyOf(codes));
    }
}

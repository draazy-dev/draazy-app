package com.draazy.api.identity.auth;

import com.draazy.api.common.validation.IndianMobile;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank @IndianMobile
        String mobile,
        String otp,
        String password,
        Boolean remember) {
    public boolean hasOtp() {
        return otp != null && !otp.isBlank();
    }

    public boolean rememberDevice() {
        return remember == null || remember;
    }
}

package com.draazy.api.identity.auth;

public record RefreshRequest(Boolean remember) {
    static boolean rememberDevice(RefreshRequest request) {
        return request == null || request.remember() == null || request.remember();
    }
}

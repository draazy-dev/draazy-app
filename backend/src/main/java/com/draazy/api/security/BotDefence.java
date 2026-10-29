package com.draazy.api.security;

public interface BotDefence {
    boolean enforced();

    boolean verify(String token, String remoteIp);
}

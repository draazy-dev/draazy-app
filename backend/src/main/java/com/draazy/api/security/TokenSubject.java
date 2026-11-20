package com.draazy.api.security;

import java.util.UUID;

public interface TokenSubject {
    UUID getId();

    String getRole();

    boolean isMobileVerified();

    boolean isVerified();

    String getTeam();
}

package com.draazy.api.common.trust;

import java.util.UUID;

@FunctionalInterface
public interface OutreachCounts {
    OutreachCounts NONE = subject -> 0;

    int forSubject(UUID subjectId);
}

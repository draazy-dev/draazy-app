package com.draazy.api.common.trust;

import java.util.OptionalInt;
import java.util.UUID;

/** How many owner contacts may this caller still open? A shared-kernel port: {@code leads} cannot import billing. */
public interface ContactAllowanceLookup {

    /** Empty means unlimited, never "unknown": a lookup that cannot answer must return a number. */
    OptionalInt contactsRemaining(UUID userId);
}

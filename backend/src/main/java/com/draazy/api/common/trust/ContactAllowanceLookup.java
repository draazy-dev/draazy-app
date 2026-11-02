package com.draazy.api.common.trust;

import java.util.OptionalInt;
import java.util.UUID;

public interface ContactAllowanceLookup {
    OptionalInt contactsRemaining(UUID userId);

    OptionalInt contactsRemaining(UUID userId, String deal);
}

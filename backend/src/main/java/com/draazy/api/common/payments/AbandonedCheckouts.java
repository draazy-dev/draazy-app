package com.draazy.api.common.payments;

import java.time.Instant;

public interface AbandonedCheckouts {
    int MAX_PER_SWEEP = 500;

    String family();

    int expireAbandonedCheckouts(Instant cutoff);
}

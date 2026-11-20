package com.draazy.api.admin;

import java.time.Instant;

public record AdminProviderHealth(
        String provider,
        boolean live,
        long ok24h,
        long failed24h,
        long skipped24h,
        long ok7d,
        long failed7d,
        Instant lastOkAt,
        Instant lastFailureAt,
        String lastFailureDetail) {
}

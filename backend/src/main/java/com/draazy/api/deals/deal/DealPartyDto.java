package com.draazy.api.deals.deal;

import java.time.Instant;

public record DealPartyDto(
        String id,
        String name,
        String mobile,
        String note,
        Instant at) {
}

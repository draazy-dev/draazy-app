package com.draazy.api.billing.plan;

import java.util.List;

public record PlanDto(
        String id,
        String name,
        String audience,
        long price,
        String billingCycle,
        Integer termDays,
        String kind,
        Integer listingLimit,
        Integer contactLimit,
        List<String> features) {
}

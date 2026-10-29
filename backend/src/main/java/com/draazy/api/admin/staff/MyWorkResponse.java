package com.draazy.api.admin.staff;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public record MyWorkResponse(
        int windowDays,
        List<Me> staff,
        List<Queue> queues) {
    public record Me(
            String name,
            List<String> functions,
            long handled,
            Map<String, Long> byFunction) {
    }

    public record Queue(
            String function,
            long open,
            Instant oldestWaitingSince) {
    }
}

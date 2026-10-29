package com.draazy.api.jobs;

import java.util.function.LongSupplier;

public record ScheduledJob(String name, Group group, LongSupplier task) {
    public enum Group {
        FREQUENT,
        HOURLY,
        NIGHTLY,
        DAYTIME
    }
}

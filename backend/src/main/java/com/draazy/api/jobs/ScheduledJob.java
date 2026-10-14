package com.draazy.api.jobs;

import java.util.function.LongSupplier;

/** One unit of background work; {@code task} returns the rows it touched. Off per environment with
 * {@code draazy.jobs.<name>.enabled=false}. */
public record ScheduledJob(String name, Group group, LongSupplier task) {

    public enum Group {
        /** Every 15 minutes: a stale row blocks a customer (a checkout, a refund, a duplicate). */
        FREQUENT,
        /** Hourly: a paid entitlement, a counter or a chart someone is looking at. */
        HOURLY,
        /** 00:00 IST: silent retention and cleanup that nobody notices. */
        NIGHTLY,
        /** 10:00 IST: anything that pushes, emails or WhatsApps a user, so phones do not buzz at night. */
        DAYTIME
    }
}

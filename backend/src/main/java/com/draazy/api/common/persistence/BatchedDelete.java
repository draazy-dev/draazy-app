package com.draazy.api.common.persistence;

import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;

/** Deletes in short autocommitted statements so a first big purge never holds one long lock. */
public final class BatchedDelete {

    static final int BATCH = 5_000;

    private BatchedDelete() {
    }

    /** {@code table}, {@code timeColumn} and {@code keep} are code constants, never request input. */
    public static long olderThan(JdbcTemplate jdbc, String table, String timeColumn, Instant cutoff) {
        return olderThan(jdbc, table, timeColumn, "false", cutoff);
    }

    /** Rows matching {@code keep} survive however old they are. */
    public static long olderThan(JdbcTemplate jdbc, String table, String timeColumn, String keep, Instant cutoff) {
        String sql = "DELETE FROM " + table + " WHERE ctid IN (SELECT ctid FROM " + table + " WHERE " + timeColumn
                + " < ? AND NOT (" + keep + ") LIMIT " + BATCH + ")";
        java.sql.Timestamp bound = java.sql.Timestamp.from(cutoff);
        long total = 0;
        int removed;
        do {
            removed = jdbc.update(sql, bound);
            total += removed;
        } while (removed == BATCH);
        return total;
    }
}
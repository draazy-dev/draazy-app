package com.draazy.api.provider.whatsapp;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class WhatsAppOptOuts {
    private final JdbcTemplate jdbc;

    WhatsAppOptOuts(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    boolean isOptedOut(String mobile) {
        return Boolean.TRUE.equals(jdbc.query("SELECT opted_out FROM whatsapp_opt_outs WHERE mobile = ?",
                rs -> rs.next() ? rs.getBoolean(1) : null, mobile));
    }

    void record(String mobile, boolean optedOut, Instant sentAt) {
        jdbc.update("""
                INSERT INTO whatsapp_opt_outs (mobile, opted_out, changed_at) VALUES (?, ?, ?)
                ON CONFLICT (mobile) DO UPDATE SET opted_out = EXCLUDED.opted_out, changed_at = EXCLUDED.changed_at
                WHERE whatsapp_opt_outs.changed_at < EXCLUDED.changed_at""",
                mobile, optedOut, Timestamp.from(sentAt));
    }
}

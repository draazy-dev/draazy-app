package com.draazy.api.common.log;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.audit.AuditLogRetention;
import com.draazy.api.support.AbstractApiTest;
import java.time.Duration;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Log retention — error_event 30 days since first seen, audit_log 365 days")
class LogRetentionTest extends AbstractApiTest {

    @Autowired
    ErrorEventRetention errorEvents;

    @Autowired
    AuditLogRetention auditLog;

    @Test
    @DisplayName("error events first seen 30+ days ago go, even if still recurring, across more than one batch")
    void errorEventsArePurgedInBatches() {
        assertThat(ErrorEventRetention.RETENTION).isEqualTo(Duration.ofDays(30));
        jdbc.update("""
                insert into error_event (fingerprint, source, first_seen, last_seen)
                select 'old-' || g, 'api', now() - interval '31 days', now() - interval '31 days'
                from generate_series(1, 5001) g
                """);
        jdbc.update("insert into error_event (fingerprint, source) values ('recent', 'api')");
        jdbc.update("""
                insert into error_event (fingerprint, source, first_seen, last_seen)
                values ('old-but-recurring', 'web', now() - interval '90 days', now() - interval '1 day')
                """);

        assertThat(errorEvents.purgeNow()).isEqualTo(5002);

        assertThat(jdbc.queryForList("select fingerprint from error_event", String.class)).containsExactly("recent");
    }

    @Test
    @DisplayName("audit entries older than a year go, except the ones code reads as state; newer ones stay")
    void auditEntriesAreKeptAYear() {
        assertThat(AuditLogRetention.RETENTION).isEqualTo(Duration.ofDays(365));
        for (String[] row : new String[][] {{"retention-test-old", "366 days"}, {"retention-test-kept", "364 days"}}) {
            jdbc.update("""
                    insert into audit_log (id, actor, actor_role, action, entity, entity_id, metadata, at)
                    values (gen_random_uuid(), ?, 'admin', 'test.retention', 'user', 'x', '{}'::jsonb,
                            now() - cast(? as interval))
                    """, row[0], row[1]);
        }
        jdbc.update("""
                insert into audit_log (id, actor, actor_role, action, entity, entity_id, metadata, at)
                values (gen_random_uuid(), 'retention-test-approval', 'admin', 'property.status', 'property', 'x',
                        '{"to":"approved"}'::jsonb, now() - interval '400 days')
                """);

        auditLog.purgeNow();

        assertThat(jdbc.queryForList(
                "select actor from audit_log where actor like 'retention-test-%' order by actor", String.class))
                .containsExactly("retention-test-approval", "retention-test-kept");
    }
}
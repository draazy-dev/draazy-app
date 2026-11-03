package com.draazy.api.common.log;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.audit.AuditLogRetention;
import com.draazy.api.engagement.messaging.OutboundMessageRetention;
import com.draazy.api.identity.auth.OtpRetention;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Log retention — error_event 30 days, audit_log 365, otp_codes 7, outbound_message 180")
class LogRetentionTest extends AbstractApiTest {

    @Autowired
    ErrorEventRetention errorEvents;

    @Autowired
    AuditLogRetention auditLog;

    @Autowired
    OtpRetention otpCodes;

    @Autowired
    OutboundMessageRetention outboundMessages;

    @Autowired
    UserRepository users;

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

    @Test
    @DisplayName("OTP codes older than 7 days go; today's stay so the daily send budget still counts them")
    void otpCodesAreKeptAWeek() {
        assertThat(OtpRetention.RETENTION).isEqualTo(Duration.ofDays(7));
        for (String[] row : new String[][] {{"9000000071", "8 days"}, {"9000000072", "6 days"}, {"9000000073", "0 days"}}) {
            jdbc.update("""
                    insert into otp_codes (mobile, code_hash, expires_at, created_at)
                    values (?, 'hash', now() - cast(? as interval) + interval '5 minutes', now() - cast(? as interval))
                    """, row[0], row[1], row[1]);
        }

        otpCodes.purgeNow();

        assertThat(jdbc.queryForList(
                "select mobile from otp_codes where mobile like '900000007%' order by mobile", String.class))
                .containsExactly("9000000072", "9000000073");
    }

    @Test
    @DisplayName("outbound messages prepared more than 180 days ago go; newer ones stay")
    void outboundMessagesAreKeptHalfAYear() {
        assertThat(OutboundMessageRetention.RETENTION).isEqualTo(Duration.ofDays(180));
        UUID owner = users.saveAndFlush(new User("9000000081", "owner")).getId();
        for (String[] row : new String[][] {{"retention-test-old", "181 days"}, {"retention-test-kept", "179 days"}}) {
            jdbc.update("""
                    insert into outbound_message
                           (channel, subject_type, subject_id, recipient_id, recipient_mobile, body, prepared_by,
                            prepared_at)
                    values ('whatsapp', 'property', gen_random_uuid(), ?, '9000000081', ?, ?,
                            now() - cast(? as interval))
                    """, owner, row[0], owner, row[1]);
        }

        outboundMessages.purgeNow();

        assertThat(jdbc.queryForList(
                "select body from outbound_message where recipient_id = ?", String.class, owner))
                .containsExactly("retention-test-kept");
    }
}
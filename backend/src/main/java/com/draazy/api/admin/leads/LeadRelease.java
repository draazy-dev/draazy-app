package com.draazy.api.admin.leads;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class LeadRelease {
    private static final String RELEASE_IDLE = """
            with freed as (
                update crm_leads set owner_id = null, claimed_at = null, next_follow_up_at = null
                 where stage in ('new', 'contacted', 'interested') and owner_id is not null
                   and greatest(claimed_at, last_activity_at) < now() - interval '72 hours'
                   and (next_follow_up_at is null or next_follow_up_at < now() - interval '72 hours')
                returning id)
            insert into crm_lead_activities (lead_id, actor_id, kind, body, created_at)
            select id, null, 'release', 'Released after 72 hours without activity', clock_timestamp() from freed
            """;

    private final JdbcTemplate jdbc;

    LeadRelease(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional
    public long releaseIdle() {
        return jdbc.update(RELEASE_IDLE);
    }
}

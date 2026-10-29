package com.draazy.api.moderation.user;

import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Repository;

@Repository
class UserTimelineRepository {
    private static final String TIMELINE = """
            select 'account' as kind, cast(u.id as text) as entity_id, u.created_at as at,
                   u.role as label, u.status as status
              from users u
             where u.id = :userId
            union all
            select 'enquiry', cast(c.id as text), c.created_at,
                   coalesce(p.title, ''), c.status
              from contact_requests c
              left join properties p on p.id = c.property_id
             where c.requester_id = :userId
            union all
            select 'visit', cast(v.id as text), v.created_at,
                   coalesce(p.title, ''), v.status
              from visits v
              left join properties p on p.id = v.property_id
             where v.visitor_id = :userId
            union all
            select 'service', cast(s.id as text), s.created_at, s.type, s.status
              from service_requests s
             where s.requester_id = :userId
            union all
            select 'listing', cast(p.id as text), p.created_at, p.title, p.status
              from properties p
             where p.owner_id = :userId
            union all
            select 'moderation', a.entity_id, a.at, a.action, null
              from audit_log a
             where a.entity = 'user'
               and a.entity_id = cast(:userId as text)
            order by at desc
            limit :cap
            """;

    private final EntityManager em;

    UserTimelineRepository(EntityManager em) {
        this.em = em;
    }

    @SuppressWarnings("unchecked")
    List<UserTimelineEntry> timeline(UUID userId, int cap) {
        List<Object[]> rows = em.createNativeQuery(TIMELINE)
                .setParameter("userId", userId)
                .setParameter("cap", cap)
                .getResultList();
        return rows.stream().map(UserTimelineRepository::toEntry).toList();
    }

    private static UserTimelineEntry toEntry(Object[] row) {
        return new UserTimelineEntry(
                (String) row[0],
                (String) row[1],
                toInstant(row[2]),
                (String) row[3],
                (String) row[4]);
    }

    private static Instant toInstant(Object value) {
        if (value instanceof Instant instant) {
            return instant;
        }
        return value instanceof Timestamp ts ? ts.toInstant() : null;
    }
}

package com.draazy.api.engagement.pageview;

import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class PageViewReportRepository {
    private final EntityManager em;

    public PageViewReportRepository(EntityManager em) {
        this.em = em;
    }

    @SuppressWarnings("unchecked")
    public List<Object[]> dailyTraffic(LocalDate from, LocalDate to) {
        return em.createNativeQuery("""
                select day, sessions, anon_sessions, signed_in_sessions, pageviews,
                       bounced_sessions, duration_seconds_total,
                       mobile_sessions, tablet_sessions, desktop_sessions
                  from page_view_daily
                 where day >= :from and day < :to
                 order by day
                """)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();
    }

    @SuppressWarnings("unchecked")
    public List<Object[]> topPaths(LocalDate from, LocalDate to, int limit) {
        return em.createNativeQuery("""
                select path,
                       sum(pageviews) as pageviews,
                       sum(anon_pageviews) as anon_pageviews,
                       sum(exits) as exits
                  from page_view_daily_paths
                 where day >= :from and day < :to
                 group by path
                 order by pageviews desc, path
                 limit :limit
                """)
                .setParameter("from", from)
                .setParameter("to", to)
                .setParameter("limit", limit)
                .getResultList();
    }

    @SuppressWarnings("unchecked")
    public List<Object[]> topExitPaths(LocalDate from, LocalDate to, int limit) {
        return em.createNativeQuery("""
                select path, sum(exits) as exits
                  from page_view_daily_paths
                 where day >= :from and day < :to
                 group by path
                having sum(exits) > 0
                 order by exits desc, path
                 limit :limit
                """)
                .setParameter("from", from)
                .setParameter("to", to)
                .setParameter("limit", limit)
                .getResultList();
    }

    @SuppressWarnings("unchecked")
    public List<Object[]> referrerSessions(LocalDate from, LocalDate to) {
        return em.createNativeQuery("""
                select referrer_host, sum(sessions) as sessions
                  from page_view_daily_referrers
                 where day >= :from and day < :to
                 group by referrer_host
                 order by sessions desc, referrer_host
                """)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();
    }

    @SuppressWarnings("unchecked")
    public List<Object[]> dailySignups(LocalDate from, LocalDate to) {
        return em.createNativeQuery("""
                select cast(created_at at time zone 'Asia/Kolkata' as date) as day,
                       count(*) as signups
                  from users
                 where cast(created_at at time zone 'Asia/Kolkata' as date) >= :from
                   and cast(created_at at time zone 'Asia/Kolkata' as date) <  :to
                 group by day
                 order by day
                """)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();
    }
}

package com.draazy.api.engagement.pageview;

import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Repository;

// Analytics reads hit only the three daily aggregates, never page_views: they have no identity column and are not
// recomputed after the 30-day sweep or erasure. Native SQL (no entity), so every query here has a test.
@Repository
public class PageViewReportRepository {

    private final EntityManager em;

    public PageViewReportRepository(EntityManager em) {
        this.em = em;
    }

    // IST days, half-open [from, to). Days without traffic are absent, not zero; the caller fills the gaps.
    // Returns [day, sessions, anon, signedIn, pageviews, bounced, durationSecs, mobile, tablet, desktop].
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

    // Ranked and capped in SQL: sorting in Java grows with every route ever served.
    // Returns [path, pageviews, anonPageviews, exits].
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

    // Its own query, not a re-sort of topPaths: a page few reach but all leave from is the one this must surface.
    // Returns [path, exits].
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

    // Uncapped on purpose: the caller folds hosts into channels plus "other", and a LIMIT would drop that tail.
    // Returns [referrerHost, sessions]; the host is "" for a direct arrival.
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

    // Cut on the same IST day as the rollup so visitor-to-signup is a like-for-like ratio; comparing timestamptz
    // to a bare date would shear days by 5h30 on a UTC server. Absent days, as in dailyTraffic. [day, signups].
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

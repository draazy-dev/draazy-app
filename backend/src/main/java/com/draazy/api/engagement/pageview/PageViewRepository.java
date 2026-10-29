package com.draazy.api.engagement.pageview;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface PageViewRepository extends JpaRepository<PageView, UUID> {
    @Modifying
    @Query("delete from PageView p where p.occurredAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);

    @Modifying
    @Query(nativeQuery = true, value = """
            delete from page_view_daily
             where day >= cast(:fromInstant at time zone 'Asia/Kolkata' as date)
            """)
    int clearDailyFrom(@Param("fromInstant") Instant fromInstant);

    @Modifying
    @Query(nativeQuery = true, value = """
            delete from page_view_daily_paths
             where day >= cast(:fromInstant at time zone 'Asia/Kolkata' as date)
            """)
    int clearDailyPathsFrom(@Param("fromInstant") Instant fromInstant);

    @Modifying
    @Query(nativeQuery = true, value = """
            insert into page_view_daily (
                    day, sessions, anon_sessions, signed_in_sessions, pageviews,
                    bounced_sessions, duration_seconds_total,
                    mobile_sessions, tablet_sessions, desktop_sessions, rolled_up_at)
            with ist as (
                select session_id,
                       signed_in,
                       device,
                       occurred_at,
                       cast(occurred_at at time zone 'Asia/Kolkata' as date) as day
                  from page_views
                 where occurred_at >= :fromInstant
                   and occurred_at < :toInstant
            ),
            sess as (
                select day,
                       session_id,
                       count(*) as views,
                       bool_or(signed_in) as signed_in,
                       extract(epoch from max(occurred_at) - min(occurred_at)) as duration_seconds,
                       (array_agg(device order by occurred_at))[1] as entry_device
                  from ist
                 group by day, session_id
            )
            select day,
                   count(*),
                   count(*) filter (where not signed_in),
                   count(*) filter (where signed_in),
                   sum(views),
                   count(*) filter (where views = 1),
                   cast(coalesce(sum(duration_seconds), 0) as bigint),
                   count(*) filter (where entry_device = 'mobile'),
                   count(*) filter (where entry_device = 'tablet'),
                   count(*) filter (where entry_device = 'desktop'),
                   now()
              from sess
             group by day
            """)
    int rebuildDaily(@Param("fromInstant") Instant fromInstant, @Param("toInstant") Instant toInstant);

    @Modifying
    @Query(nativeQuery = true, value = """
            insert into page_view_daily_paths (day, path, pageviews, anon_pageviews, exits)
            with ist as (
                select session_id,
                       signed_in,
                       path,
                       occurred_at,
                       cast(occurred_at at time zone 'Asia/Kolkata' as date) as day
                  from page_views
                 where occurred_at >= :fromInstant
                   and occurred_at < :toInstant
            ),
            viewed as (
                select day,
                       path,
                       count(*) as pageviews,
                       count(*) filter (where not signed_in) as anon_pageviews
                  from ist
                 group by day, path
            ),
            last_of_session as (
                select day,
                       (array_agg(path order by occurred_at desc))[1] as path
                  from ist
                 group by day, session_id
            ),
            exited as (
                select day, path, count(*) as exits
                  from last_of_session
                 group by day, path
            )
            select v.day, v.path, v.pageviews, v.anon_pageviews, coalesce(e.exits, 0)
              from viewed v
              left join exited e on e.day = v.day and e.path = v.path
            """)
    int rebuildDailyPaths(@Param("fromInstant") Instant fromInstant,
            @Param("toInstant") Instant toInstant);

    @Modifying
    @Query(nativeQuery = true, value = """
            delete from page_view_daily_referrers
             where day >= cast(:fromInstant at time zone 'Asia/Kolkata' as date)
            """)
    int clearDailyReferrersFrom(@Param("fromInstant") Instant fromInstant);

    @Modifying
    @Query(nativeQuery = true, value = """
            insert into page_view_daily_referrers (day, referrer_host, sessions)
            with ist as (
                select session_id,
                       referrer_host,
                       occurred_at,
                       cast(occurred_at at time zone 'Asia/Kolkata' as date) as day
                  from page_views
                 where occurred_at >= :fromInstant
                   and occurred_at < :toInstant
            ),
            sess as (
                select day,
                       session_id,
                       (array_agg(coalesce(referrer_host, '') order by occurred_at))[1] as entry_host
                  from ist
                 group by day, session_id
            )
            select day, entry_host, count(*)
              from sess
             group by day, entry_host
            """)
    int rebuildDailyReferrers(@Param("fromInstant") Instant fromInstant,
            @Param("toInstant") Instant toInstant);
}

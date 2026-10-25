package com.draazy.api.admin;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.engagement.flatmate.FlatmateModerationService;
import com.draazy.api.moderation.report.ReportStatuses;
import com.draazy.api.moderation.report.ReportTargetTypes;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The flatmate figures behind {@code GET /admin/analytics/flatmates} and the dashboard's flatmate tiles. */
@Service
public class AdminFlatmateAnalyticsService {

    static final int DEFAULT_DAYS = 90;
    static final int MAX_DAYS = 365;
    /** A request unanswered for two days has, for the seeker waiting on it, gone unanswered. */
    static final int REPLY_HOURS = 48;
    private static final int GLANCE_DAYS = 30;
    private static final int LOCALITY_LIMIT = 20;
    private static final String IST = PlatformTime.IST.getId();
    private static final String PUBLIC = "('live', 'approved')";

    /* Every post counts in the week it was made, withdrawn or rejected later or not: the posting happened.
       A `join` is an open-policy group's instant accept, so it is a match but never a request. */
    private static final String EVENTS = """
            with events(kind, at) as (
                select 'rooms', created_at from flatmate_rooms
                union all select 'groups', created_at from flatmate_groups
                union all select 'seekers', created_at from flatmate_seeker_posts
                union all select 'requests', requested_at from flatmate_requests where action = 'request'
                union all select 'matches', decided_at from flatmate_requests where status = 'accepted'
                union all select 'matches', decided_at from flatmate_group_applications where status = 'accepted'
            )
            select kind, cast(date_trunc('week', at at time zone '%1$s') as date), count(*)
              from events
             where (at at time zone '%1$s') >= cast(:from as date)
               and (at at time zone '%1$s') <  cast(:to as date)
             group by 1, 2
            """.formatted(IST);

    private static final String REQUESTS_IN_WINDOW = """
              from flatmate_requests
             where action = 'request'
               and (requested_at at time zone '%1$s') >= cast(:from as date)
               and (requested_at at time zone '%1$s') <  cast(:to as date)
            """.formatted(IST);

    // A pending request younger than the reply window has not had its chance yet, so it is not judged.
    private static final String JUDGED =
            "decided_at is not null or requested_at < now() - make_interval(hours => :reply)";
    private static final String REPLIED =
            "decided_at is not null and decided_at <= requested_at + make_interval(hours => :reply)";

    private static final String WEEKLY_REPLIES = """
            select cast(date_trunc('week', requested_at at time zone '%1$s') as date),
                   count(*) filter (where %2$s),
                   count(*) filter (where %3$s)
            %4$s
             group by 1
            """.formatted(IST, JUDGED, REPLIED, REQUESTS_IN_WINDOW);

    private static final String REPLIES = """
            select count(*),
                   count(*) filter (where %1$s),
                   count(*) filter (where %2$s),
                   count(*) filter (where status <> 'pending'),
                   count(*) filter (where status = 'accepted'),
                   percentile_cont(0.5) within group (
                       order by extract(epoch from (decided_at - requested_at)) / 3600.0)
                       filter (where decided_at is not null)
            %3$s
            """.formatted(JUDGED, REPLIED, REQUESTS_IN_WINDOW);

    private static final String UNANSWERED = """
            select count(*) from flatmate_requests
             where action = 'request' and status = 'pending'
               and requested_at < now() - make_interval(hours => :reply)
            """;

    private static final String GLANCE = """
            select (select count(*) from reports where target_type = :postType and status in (:open)),
                   (select count(*) from flatmate_rooms where archived = false and mod_status in %1$s),
                   (select count(*) from flatmate_groups where archived = false and mod_status in %1$s),
                   (select count(*) from flatmate_seeker_posts where archived = false and mod_status in %1$s),
                   (select count(*) from flatmate_seeker_posts
                     where archived = false and mod_status in %1$s and created_at >= now() - interval '7 days'),
                   (select count(*) from flatmate_requests
                     where status = 'accepted' and decided_at >= now() - make_interval(days => :days))
                 + (select count(*) from flatmate_group_applications
                     where status = 'accepted' and decided_at >= now() - make_interval(days => :days))
            """.formatted(PUBLIC);

    /* Keyed case-insensitively because seekers type localities while hosts pick them. A hunting group
       has no flat, so it is demand for the localities it names rather than supply in its own. */
    private static final String LOCALITIES = """
            with supply as (
                select lower(trim(locality)) as k, min(trim(locality)) as label, count(*) as n from (
                    select locality from flatmate_rooms where archived = false and mod_status in %1$s
                    union all
                    select locality from flatmate_groups
                     where archived = false and hunting = false and mod_status in %1$s
                ) s group by 1
            ), demand as (
                select lower(trim(l)) as k, min(trim(l)) as label, count(*) as n from (
                    select jsonb_array_elements_text(localities) as l from flatmate_seeker_posts
                     where archived = false and mod_status in %1$s
                    union all
                    select jsonb_array_elements_text(localities) from flatmate_groups
                     where archived = false and hunting = true and mod_status in %1$s
                ) d where trim(l) <> '' group by 1
            )
            select coalesce(s.label, d.label), coalesce(s.n, 0), coalesce(d.n, 0)
              from supply s full join demand d on d.k = s.k
             order by coalesce(d.n, 0) - coalesce(s.n, 0) desc, coalesce(d.n, 0) desc, 1
             limit :limit
            """.formatted(PUBLIC);

    private final EntityManager em;
    private final FlatmateModerationService moderation;

    public AdminFlatmateAnalyticsService(EntityManager em, FlatmateModerationService moderation) {
        this.em = em;
        this.moderation = moderation;
    }

    @Transactional(readOnly = true)
    public AdminDashboard.Flatmates glance() {
        Object[] row = (Object[]) em.createNativeQuery(GLANCE)
                .setParameter("postType", ReportTargetTypes.POST)
                .setParameter("open", ReportStatuses.LIVE)
                .setParameter("days", GLANCE_DAYS)
                .getSingleResult();
        LocalDate to = LocalDate.now(PlatformTime.IST).plusDays(1);
        AdminAnalyticsFlatmates.Replies replies = replies(to.minusDays(GLANCE_DAYS), to);
        return new AdminDashboard.Flatmates(moderation.moderationSummary().pending(), num(row[0]),
                replies.unansweredNow(), num(row[1]), num(row[2]), num(row[3]), num(row[4]), num(row[5]),
                replies.replyRatePct(), replies.medianReplyHours());
    }

    @Transactional(readOnly = true)
    public AdminAnalyticsFlatmates report(Integer requested) {
        int days = requested == null ? DEFAULT_DAYS : requested;
        if (days < 1 || days > MAX_DAYS) {
            throw new BadRequestException("days must be between 1 and " + MAX_DAYS + ", was " + days);
        }
        LocalDate to = LocalDate.now(PlatformTime.IST).plusDays(1);
        LocalDate from = to.minusDays(days);
        return new AdminAnalyticsFlatmates(days, from, to, weeks(from, to), replies(from, to), localities());
    }

    /** Zero-filled so a quiet week is drawn as zero rather than skipped by the chart. */
    private List<AdminAnalyticsFlatmates.Week> weeks(LocalDate from, LocalDate to) {
        List<String> kinds = List.of("rooms", "groups", "seekers", "requests", "matches");
        Map<LocalDate, long[]> weekly = new TreeMap<>();
        for (LocalDate w = from.with(DayOfWeek.MONDAY); w.isBefore(to); w = w.plusWeeks(1)) {
            weekly.put(w, new long[kinds.size() + 2]);
        }
        for (Object[] r : rows(window(EVENTS, from, to))) {
            weekly.get(date(r[1]))[kinds.indexOf((String) r[0])] = num(r[2]);
        }
        for (Object[] r : rows(window(WEEKLY_REPLIES, from, to).setParameter("reply", REPLY_HOURS))) {
            long[] c = weekly.get(date(r[0]));
            c[kinds.size()] = num(r[1]);
            c[kinds.size() + 1] = num(r[2]);
        }
        List<AdminAnalyticsFlatmates.Week> out = new ArrayList<>();
        weekly.forEach((w, c) -> out.add(new AdminAnalyticsFlatmates.Week(w, c[0], c[1], c[2], c[3], c[4],
                pct(c[6], c[5]))));
        return out;
    }

    private AdminAnalyticsFlatmates.Replies replies(LocalDate from, LocalDate to) {
        Object[] r = (Object[]) window(REPLIES, from, to).setParameter("reply", REPLY_HOURS).getSingleResult();
        long unanswered = num(em.createNativeQuery(UNANSWERED).setParameter("reply", REPLY_HOURS).getSingleResult());
        return new AdminAnalyticsFlatmates.Replies(num(r[0]), pct(num(r[2]), num(r[1])),
                pct(num(r[4]), num(r[3])), r[5] == null ? null : round1(((Number) r[5]).doubleValue()), unanswered);
    }

    @SuppressWarnings("unchecked")
    private List<AdminAnalyticsFlatmates.LocalityRow> localities() {
        List<Object[]> rows = em.createNativeQuery(LOCALITIES).setParameter("limit", LOCALITY_LIMIT).getResultList();
        return rows.stream()
                .map(r -> new AdminAnalyticsFlatmates.LocalityRow((String) r[0], num(r[1]), num(r[2])))
                .toList();
    }

    private Query window(String sql, LocalDate from, LocalDate to) {
        return em.createNativeQuery(sql).setParameter("from", from).setParameter("to", to);
    }

    @SuppressWarnings("unchecked")
    private static List<Object[]> rows(Query query) {
        return query.getResultList();
    }

    /** Null, not 0 or 100, when there was nothing to measure. */
    private static Integer pct(long part, long whole) {
        return whole == 0 ? null : (int) Math.round(part * 100.0 / whole);
    }

    private static LocalDate date(Object value) {
        return value instanceof java.sql.Date d ? d.toLocalDate() : (LocalDate) value;
    }

    private static long num(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    private static double round1(double value) {
        return Math.round(value * 10.0) / 10.0;
    }
}

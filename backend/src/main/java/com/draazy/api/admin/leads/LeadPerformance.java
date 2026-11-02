package com.draazy.api.admin.leads;

import com.draazy.api.admin.leads.LeadViews.Performance;
import com.draazy.api.admin.leads.LeadViews.PerformanceRow;
import com.draazy.api.common.error.BadRequestException;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeadPerformance {
    private static final Set<Integer> WINDOWS = Set.of(7, 30, 90);

    private static final class Acc {
        String name = "Staff";
        int open;
        int claimed;
        int contacted;
        int attempts;
        double firstContactHours;
        int firstContactCount;
        int conversions;
        long revenue;
    }

    private static final String STAFF = """
            select u.id, coalesce(u.name, 'Staff') as name from users u
             where u.role in ('staff', 'manager', 'admin')
               and (exists (select 1 from crm_leads l where l.owner_id = u.id)
                    or exists (select 1 from crm_lead_activities a
                                where a.actor_id = u.id and a.created_at >= now() - make_interval(days => ?))
                    or exists (select 1 from crm_lead_conversions c
                                where c.credited_to = u.id and c.created_at >= now() - make_interval(days => ?)))
            """;

    private static final String OPEN = """
            select owner_id as staff, count(*) as n from crm_leads
             where owner_id is not null and stage in ('new', 'contacted', 'interested') group by owner_id
            """;

    private static final String CLAIMED = """
            select staff, count(distinct lead) as n from (
                select owner_id as staff, id as lead from crm_leads
                 where owner_id is not null and claimed_at >= now() - make_interval(days => ?)
                union
                select actor_id, lead_id from crm_lead_activities
                 where kind = 'claim' and actor_id is not null and created_at >= now() - make_interval(days => ?)
            ) claims group by staff
            """;

    private static final String CONTACTS = """
            select actor_id as staff, count(*) as attempts, count(distinct lead_id) as contacted
              from crm_lead_activities
             where kind in ('call', 'whatsapp', 'sms') and actor_id is not null
               and created_at >= now() - make_interval(days => ?)
             group by actor_id
            """;

    private static final String FIRST_CONTACT = """
            select a.actor_id as staff,
                   sum(extract(epoch from (a.created_at - c.created_at)) / 3600.0) as hours, count(*) as n
              from (select distinct on (lead_id) lead_id, actor_id, created_at from crm_lead_activities
                     where kind in ('call', 'whatsapp', 'sms') and created_at >= now() - make_interval(days => ?)
                     order by lead_id, created_at) a
              join lateral (select x.created_at from crm_lead_activities x
                             where x.lead_id = a.lead_id and x.kind in ('claim', 'assign')
                               and x.created_at <= a.created_at
                             order by x.created_at desc limit 1) c on true
             where a.actor_id is not null
             group by a.actor_id
            """;

    private static final String CONVERSIONS = """
            select credited_to as staff, count(*) as n, coalesce(sum(amount), 0)::bigint as revenue
              from crm_lead_conversions where created_at >= now() - make_interval(days => ?)
             group by credited_to
            """;

    private final JdbcTemplate jdbc;

    LeadPerformance(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public Performance report(Integer requestedDays) {
        int days = requestedDays == null ? 30 : requestedDays;
        if (!WINDOWS.contains(days)) {
            throw new BadRequestException("days must be 7, 30 or 90");
        }
        Map<UUID, Acc> staff = new LinkedHashMap<>();
        jdbc.query(STAFF, rs -> {
            staff.computeIfAbsent(rs.getObject("id", UUID.class), k -> new Acc()).name = rs.getString("name");
        }, days, days);
        jdbc.query(OPEN, rs -> {
            acc(staff, rs.getObject("staff", UUID.class)).open = rs.getInt("n");
        });
        jdbc.query(CLAIMED, rs -> {
            acc(staff, rs.getObject("staff", UUID.class)).claimed = rs.getInt("n");
        }, days, days);
        jdbc.query(CONTACTS, rs -> {
            Acc a = acc(staff, rs.getObject("staff", UUID.class));
            a.attempts = rs.getInt("attempts");
            a.contacted = rs.getInt("contacted");
        }, days);
        jdbc.query(FIRST_CONTACT, rs -> {
            Acc a = acc(staff, rs.getObject("staff", UUID.class));
            a.firstContactHours = rs.getDouble("hours");
            a.firstContactCount = rs.getInt("n");
        }, days);
        jdbc.query(CONVERSIONS, rs -> {
            Acc a = acc(staff, rs.getObject("staff", UUID.class));
            a.conversions = rs.getInt("n");
            a.revenue = rs.getLong("revenue");
        }, days);
        List<PerformanceRow> rows = staff.entrySet().stream()
                .map(e -> row(e.getKey(), e.getValue()))
                .sorted(Comparator.comparingInt(PerformanceRow::conversions).reversed()
                        .thenComparing(PerformanceRow::staffName, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return new Performance(days, rows, totals(staff.values()));
    }

    private static Acc acc(Map<UUID, Acc> staff, UUID id) {
        return staff.computeIfAbsent(id, k -> new Acc());
    }

    private static PerformanceRow row(UUID id, Acc a) {
        return new PerformanceRow(id, a.name, a.open, a.claimed, a.contacted, a.attempts,
                average(a.firstContactHours, a.firstContactCount), a.conversions, a.revenue,
                rate(a.conversions, a.claimed));
    }

    private static PerformanceRow totals(Iterable<Acc> all) {
        Acc sum = new Acc();
        for (Acc a : all) {
            sum.open += a.open;
            sum.claimed += a.claimed;
            sum.contacted += a.contacted;
            sum.attempts += a.attempts;
            sum.firstContactHours += a.firstContactHours;
            sum.firstContactCount += a.firstContactCount;
            sum.conversions += a.conversions;
            sum.revenue += a.revenue;
        }
        PerformanceRow row = row(null, sum);
        return new PerformanceRow(null, null, row.openLeads(), row.claimed(), row.contacted(), row.attempts(),
                row.avgFirstContactHours(), row.conversions(), row.revenue(), row.conversionRate());
    }

    private static double average(double total, int count) {
        return count == 0 ? 0 : round1(total / count);
    }

    private static double rate(int conversions, int claimed) {
        return claimed == 0 ? 0 : round1(conversions * 100.0 / claimed);
    }

    private static double round1(double value) {
        return Math.round(value * 10) / 10.0;
    }
}

package com.draazy.api.admin;

import com.draazy.api.common.PlatformTime;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Repository;

@Repository
public class AdminMetricsRepository {

    // Spelled as a string because it is interpolated into SQL.
    private static final String IST = PlatformTime.IST.getId();

    // Invoices are issued only when the gateway confirms a payment and credit notes only when it confirms a refund,
    // so together they are the money ledger. `fee` is Draazy's own part; the rest is statutory pass-through.
    private static final String MONEY = """
            select i.id, i.number, i.user_id, cast((i.issued_at at time zone '%1$s') as date) as day,
                   case when i.source_type = 'subscription' then 'subscription' else 'service' end as source,
                   false as refund, i.amount as gross, i.taxable_amount as fee
              from invoices i
            union all
            select c.id, c.number, c.user_id, cast((c.issued_at at time zone '%1$s') as date),
                   case when c.source_type = 'subscription' then 'subscription' else 'service' end,
                   true, -c.amount, -c.taxable_amount
              from credit_notes c
            """.formatted(IST);

    private static final String WINDOW = """
             where (cast(:from as date) is null or day >= cast(:from as date))
               and (cast(:to   as date) is null or day <  cast(:to   as date))
            """;

    private static final String MONEY_TOTALS = """
            select coalesce(sum(gross) filter (where not refund), 0),
                   coalesce(-sum(gross) filter (where refund), 0),
                   coalesce(sum(gross - fee), 0),
                   coalesce(sum(fee), 0),
                   count(*) filter (where not refund)
              from (%s) money
            """.formatted(MONEY) + WINDOW;

    // Buckets with no money in a given source simply do not appear; the service fills the gaps.
    private static final String FEE_SERIES = """
            select cast(date_trunc('month', cast(day as timestamp)) as date) as bucket, source,
                   coalesce(sum(fee) filter (where not refund), 0),
                   coalesce(-sum(fee) filter (where refund), 0)
              from (%s) money
            """.formatted(MONEY) + WINDOW + " group by bucket, source order by bucket, source";

    private static final String ATTENTION = """
            select (select count(*) from refund_requests where status = 'pending_review'),
                   (select coalesce(sum(amount), 0) from refund_requests where status = 'pending_review'),
                   (select count(*) from service_request_refunds where status = 'requested'),
                   (select coalesce(sum(amount), 0) from service_request_refunds where status = 'requested'),
                   (select count(*) from payment_disputes where status = 'open'),
                   (select coalesce(sum(amount), 0) from payment_disputes where status = 'open')
            """;

    private static final String MRR = """
            select coalesce(sum(
                     case coalesce(p.billing_cycle, 'monthly')
                       when 'monthly'   then s.amount
                       when 'quarterly' then round(s.amount / 3.0)
                       when 'yearly'    then round(s.amount / 12.0)
                       else s.amount
                     end), 0)::bigint
              from subscriptions s
              join plans p on p.id = s.plan_id
             where s.status = 'active'
               and s.payment_ref is not null
               and s.amount > 0
            """;

    // Group by charged amount so repriced plans show old and new cohorts separately.
    private static final String PLAN_LINES = """
            select p.name, p.audience, coalesce(p.billing_cycle, 'monthly'), s.amount,
                   count(*) as active,
                   coalesce(sum(
                     case coalesce(p.billing_cycle, 'monthly')
                       when 'monthly'   then s.amount
                       when 'quarterly' then round(s.amount / 3.0)
                       when 'yearly'    then round(s.amount / 12.0)
                       else s.amount
                     end), 0)::bigint as monthly,
                   p.term_days
              from subscriptions s
              join plans p on p.id = s.plan_id
             where s.status = 'active'
               and s.payment_ref is not null
               and s.amount > 0
             group by p.id, p.name, p.audience, p.billing_cycle, p.term_days, s.amount
             order by p.name, s.amount
            """;

    private static final String LEDGER_ROWS = """
            select m.id, m.day as occurred_on, m.number, coalesce(u.name, 'Member') as party,
                   case when m.refund then 'refund' else m.source end as kind,
                   m.gross as amount, m.fee
              from (%s) m
              left join users u on u.id = m.user_id
            """.formatted(MONEY);

    // The filter applied to `#LEDGER_ROWS`, written once and used by both the page and its count.
    // Every bound parameter is cast to its type before the null test.
    private static final String LEDGER_FILTER = """
             where (cast(:kind as text) is null or kind = cast(:kind as text))
               and (cast(:q    as text) is null or party ilike cast(:q as text) escape '\\'
                                                or number ilike cast(:q as text) escape '\\')
               and (cast(:since as date) is null or occurred_on >= cast(:since as date))
            """;

    private static final String LEDGER_PROJECTION =
            "select id, occurred_on, number, party, kind, amount, fee from ";

    private final EntityManager em;

    public AdminMetricsRepository(EntityManager em) {
        this.em = em;
    }

    /** Listings that are not soft-deleted, optionally narrowed to one moderation status. */
    public long countListings(String status) {
        String sql = "select count(*) from properties where archived = false"
                + (status == null ? "" : " and status = :status");
        Query query = em.createNativeQuery(sql);
        if (status != null) {
            query.setParameter("status", status);
        }
        return ((Number) query.getSingleResult()).longValue();
    }

    /** Users that are not soft-deleted, optionally only those who joined within {@code days}. */
    public long countUsers(Integer withinDays) {
        String sql = "select count(*) from users where archived = false"
                + (withinDays == null ? ""
                        : " and (joined_at at time zone '" + IST + "') >= "
                                + "(now() at time zone '" + IST + "') - make_interval(days => :d)");
        Query query = em.createNativeQuery(sql);
        if (withinDays != null) {
            query.setParameter("d", withinDays);
        }
        return ((Number) query.getSingleResult()).longValue();
    }

    public long countDealsClosed(int withinDays) {
        Query query = em.createNativeQuery("""
                select count(*) from deals
                 where status = 'closed'
                   and closed_at is not null
                   and closed_at >= now() - make_interval(days => :d)
                """);
        query.setParameter("d", withinDays);
        return ((Number) query.getSingleResult()).longValue();
    }

    public long countContactRequests(String status) {
        return count("select count(*) from contact_requests where status = :v", status);
    }

    public long countVisits(String status) {
        return count("select count(*) from visits where status = :v", status);
    }

    public long countDealsNotClosed() {
        return count("select count(*) from deals where status <> :v", "closed");
    }

    public long countUsersWithRole(String role) {
        return count("select count(*) from users where archived = false and role = :v", role);
    }

    private long count(String sql, String value) {
        return ((Number) em.createNativeQuery(sql).setParameter("v", value)
                .getSingleResult()).longValue();
    }

    public AdminFinance.Money money(LocalDate from, LocalDate to) {
        Object[] row = (Object[]) em.createNativeQuery(MONEY_TOTALS)
                .setParameter("from", from)
                .setParameter("to", to)
                .getSingleResult();
        return new AdminFinance.Money(longAt(row, 0), longAt(row, 1), longAt(row, 2), longAt(row, 3),
                longAt(row, 4));
    }

    /** Rows of month bucket, source, fees invoiced, fees credited back. */
    @SuppressWarnings("unchecked")
    public List<Object[]> feeSeries(LocalDate from, LocalDate to) {
        return em.createNativeQuery(FEE_SERIES)
                .setParameter("from", from)
                .setParameter("to", to)
                .getResultList();
    }

    public AdminFinance.Attention attention() {
        Object[] row = (Object[]) em.createNativeQuery(ATTENTION).getSingleResult();
        return new AdminFinance.Attention(longAt(row, 0), longAt(row, 1), longAt(row, 2), longAt(row, 3),
                longAt(row, 4), longAt(row, 5));
    }

    private static long longAt(Object[] row, int index) {
        return ((Number) row[index]).longValue();
    }

    /** Monthly run rate of the active subscription book, in whole rupees. See {@link #MRR}. */
    public long mrr() {
        return ((Number) em.createNativeQuery(MRR).getSingleResult()).longValue();
    }

    @SuppressWarnings("unchecked")
    public List<Object[]> subscriptionPlanLines() {
        return em.createNativeQuery(PLAN_LINES).getResultList();
    }

    @SuppressWarnings("unchecked")
    public List<Object[]> ledger(String kind, String q, LocalDate since, int limit, long offset) {
        return em.createNativeQuery(LEDGER_PROJECTION + "(" + LEDGER_ROWS + ") ledger"
                + LEDGER_FILTER
                + " order by occurred_on desc nulls last, number desc, id limit :limit offset :offset")
                .setParameter("kind", kind)
                .setParameter("q", q)
                .setParameter("since", since)
                .setParameter("limit", limit)
                .setParameter("offset", offset)
                .getResultList();
    }

    public long ledgerCount(String kind, String q, LocalDate since) {
        return ((Number) em.createNativeQuery(
                "select count(*) from (" + LEDGER_ROWS + ") ledger" + LEDGER_FILTER)
                .setParameter("kind", kind)
                .setParameter("q", q)
                .setParameter("since", since)
                .getSingleResult()).longValue();
    }
    }

package com.draazy.api.admin.leads;

import com.draazy.api.admin.leads.LeadIngest.Incoming;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class LeadSources {
    record Feed(String source, String sql, List<String> interests, String summary, String leadType, String intent) {
        Feed(String source, String sql, List<String> interests, String summary) {
            this(source, sql, interests, summary, null, null);
        }
    }

    private static final String FLATMATE_SEEKERS = """
            select 'seeker:' || p.id::text as ref, u.mobile, coalesce(nullif(p.name, ''), u.name) as name,
                   null as interest, null as bhk, p.budget,
                   (select string_agg(x, ', ') from jsonb_array_elements_text(p.localities) x) as localities
              from flatmate_seeker_posts p
              join users u on u.id = p.user_id
             where p.mod_status in ('live', 'approved') and not p.archived
               and u.mobile is not null and not u.archived and u.role not in ('staff', 'manager', 'admin')
               and not exists (select 1 from crm_lead_signals s where s.source = 'flatmate'
                                  and s.source_ref = 'seeker:' || p.id::text)
             order by p.created_at desc limit 200
            """;

    private static final String FLATMATE_ROOMS = """
            select 'room:' || r.id::text as ref, u.mobile, u.name, null as interest, r.bhk, r.budget,
                   r.locality as localities
              from flatmate_rooms r
              join users u on u.id = r.host_id
             where r.mod_status in ('live', 'approved') and not r.archived
               and u.mobile is not null and not u.archived and u.role not in ('staff', 'manager', 'admin')
               and not exists (select 1 from crm_lead_signals s where s.source = 'flatmate'
                                  and s.source_ref = 'room:' || r.id::text)
             order by r.created_at desc limit 200
            """;

    private static final String RA_OWNER = """
            select m.agreement_request_id::text || ':owner' as ref, u.mobile, u.name, null as interest
              from managed_properties m
              join users u on u.id = m.owner_id
             where m.agreement_request_id is not null
               and u.mobile is not null and not u.archived and u.role not in ('staff', 'manager', 'admin')
               and not exists (select 1 from crm_lead_signals s where s.source = 'rent-agreement'
                                  and s.source_ref = m.agreement_request_id::text || ':owner')
             order by m.created_at desc limit 200
            """;

    private static final String RA_TENANT = """
            select m.agreement_request_id::text || ':tenant' as ref, m.tenant_mobile as mobile,
                   m.tenant_name as name, null as interest
              from managed_properties m
              left join users t on t.mobile = m.tenant_mobile
             where m.agreement_request_id is not null and m.tenant_mobile is not null
               and (t.id is null or (not t.archived and t.role not in ('staff', 'manager', 'admin')))
               and not exists (select 1 from crm_lead_signals s where s.source = 'rent-agreement'
                                  and s.source_ref = m.agreement_request_id::text || ':tenant')
             order by m.created_at desc limit 200
            """;

    private static final String UNPAID = """
            select r.id::text as ref, u.mobile, u.name, r.type as interest
              from service_requests r
              join users u on u.id = r.requester_id
             where r.created_at between now() - interval '30 days' and now() - interval '2 hours'
               and u.mobile is not null and not u.archived and u.role not in ('staff', 'manager', 'admin')
               and (r.status = 'awaiting-payment'
                    or (r.status = 'cancelled' and exists (select 1 from service_request_timeline t
                                                            where t.request_id = r.id
                                                              and t.event = 'payment.abandoned')))
               and not exists (select 1 from service_requests p
                                where p.requester_id = r.requester_id and p.type = r.type
                                  and p.created_at > r.created_at
                                  and p.status not in ('awaiting-payment', 'cancelled'))
               and not exists (select 1 from crm_lead_signals s
                                where s.source = 'unpaid-checkout' and s.source_ref = r.id::text)
             order by r.created_at desc limit 200
            """;

    private static final String QUOTES = """
            select t.id::text as ref, t.mobile, coalesce(t.customer, u.name) as name, t.team as interest
              from tickets t
              left join users u on u.id = t.requester_id
             where t.team is not null and t.mobile is not null
               and (u.id is null or (not u.archived and u.role not in ('staff', 'manager', 'admin')))
               and not exists (select 1 from crm_lead_signals s
                                where s.source = 'quote-request' and s.source_ref = t.id::text)
             order by t.created_at desc limit 200
            """;

    private static final String LEASE_OWNER = """
            select m.id::text || ':' || m.lease_end::text || ':owner' as ref, u.mobile, u.name, null as interest
              from managed_properties m
              join users u on u.id = m.owner_id
              join notification_preferences np on np.user_id = u.id and np.marketing_consent_at is not null
             where m.rented and m.lease_end between (now() at time zone 'Asia/Kolkata')::date
                                                and (now() at time zone 'Asia/Kolkata')::date + 60
               and u.mobile is not null and not u.archived and u.role not in ('staff', 'manager', 'admin')
               and not exists (select 1 from crm_lead_signals s where s.source = 'lease-ending'
                                  and s.source_ref = m.id::text || ':' || m.lease_end::text || ':owner')
             order by m.lease_end limit 200
            """;

    private static final String LEASE_TENANT = """
            select m.id::text || ':' || m.lease_end::text || ':tenant' as ref, t.mobile, t.name, null as interest
              from managed_properties m
              join users t on t.mobile = m.tenant_mobile and not t.archived and t.mobile_verified
                          and t.id <> m.owner_id and t.role not in ('staff', 'manager', 'admin')
              join notification_preferences np on np.user_id = t.id and np.marketing_consent_at is not null
             where m.rented and m.lease_end between (now() at time zone 'Asia/Kolkata')::date
                                                and (now() at time zone 'Asia/Kolkata')::date + 60
               and not exists (select 1 from crm_lead_signals s where s.source = 'lease-ending'
                                  and s.source_ref = m.id::text || ':' || m.lease_end::text || ':tenant')
             order by m.lease_end limit 200
            """;

    static final List<Feed> FEEDS = List.of(
            new Feed("rent-agreement", RA_OWNER, List.of("legal", "valuation", "interior"),
                    "Rent agreement registered (owner)", LeadVocabulary.OWNER, "rent-out"),
            new Feed("rent-agreement", RA_TENANT, List.of("packers", "interior"),
                    "Rent agreement registered (tenant)"),
            new Feed("unpaid-checkout", UNPAID, null, "Left checkout unpaid: "),
            new Feed("quote-request", QUOTES, null, "Asked for a quote: "),
            new Feed("lease-ending", LEASE_OWNER, List.of("rent-agreement", "listing"),
                    "Lease ending soon (owner)", LeadVocabulary.OWNER, "rent-out"),
            new Feed("lease-ending", LEASE_TENANT, List.of("rent-agreement", "home-search", "packers"),
                    "Lease ending soon (tenant)", LeadVocabulary.SEEKER, "rent"),
            new Feed("flatmate", FLATMATE_SEEKERS, List.of("home-search", "packers"),
                    "Posted a flatmate profile (needs a room)", LeadVocabulary.FLATMATE, "needs-room"),
            new Feed("flatmate", FLATMATE_ROOMS, List.of("rent-agreement"),
                    "Listed a room for flatmates", LeadVocabulary.FLATMATE, "has-room"));

    private final JdbcTemplate jdbc;

    LeadSources(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    List<Incoming> pull(Feed feed) {
        return jdbc.query(feed.sql(), (rs, i) -> {
            String raw = rs.getString("interest");
            String service = raw == null ? null : service(raw);
            List<String> interests = feed.interests() != null ? feed.interests()
                    : service == null ? List.of() : List.of(service);
            String summary = service == null ? feed.summary() : feed.summary() + service;
            return new Incoming(feed.source(), rs.getString("ref"), rs.getString("mobile"), rs.getString("name"),
                    interests, summary, profile(feed, rs));
        });
    }

    private static LeadProfile profile(Feed feed, ResultSet rs) throws SQLException {
        if (!LeadVocabulary.FLATMATE.equals(feed.leadType())) {
            return LeadProfile.fed(feed.leadType(), feed.intent(), List.of(), null, null);
        }
        String bhk = rs.getString("bhk");
        Long budget = rs.getObject("budget", Long.class);
        List<String> rooms = bhk != null && LeadVocabulary.BHK.contains(bhk) ? List.of(bhk) : List.of();
        return LeadProfile.fed(feed.leadType(), feed.intent(), rooms, rs.getString("localities"), budget);
    }

    static String service(String raw) {
        return "rental".equals(raw) ? "rent-agreement" : raw;
    }
}

package com.draazy.api.admin.leads;

import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.validation.Formats;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class LeadIngest {
    record Incoming(String source, String ref, String mobile, String name, List<String> interests, String summary,
            LeadProfile profile) {
    }

    record Landed(UUID leadId, boolean created) {
    }

    private static final Pattern VALID_MOBILE = Pattern.compile(Formats.MOBILE);

    private static final String ACCOUNT = "select id, role, archived, name from users where mobile = ?";

    private static final String SIGNAL_SEEN = """
            select exists (select 1 from crm_lead_signals where source = ? and source_ref = ?)
            """;

    private static final String UPSERT = """
            insert into crm_leads (mobile, user_id, name, interests, last_signal_at, lead_type, intent,
                                   property_types, bhk, localities, budget, lead_source, source_detail)
            values (?, ?, ?, cast(? as text[]), now(), ?, ?, cast(? as text[]), cast(? as text[]), ?, ?, ?, ?)
            on conflict (mobile) do update set
                interests = (select coalesce(array_agg(distinct i order by i), '{}')
                               from unnest(crm_leads.interests || excluded.interests) i),
                user_id = coalesce(crm_leads.user_id, excluded.user_id),
                name = coalesce(crm_leads.name, excluded.name),
                lead_type = coalesce(crm_leads.lead_type, excluded.lead_type),
                intent = case when crm_leads.lead_type is null
                                or crm_leads.lead_type = excluded.lead_type
                              then coalesce(crm_leads.intent, excluded.intent) else crm_leads.intent end,
                property_types = case when cardinality(crm_leads.property_types) = 0
                                      then excluded.property_types else crm_leads.property_types end,
                bhk = case when cardinality(crm_leads.bhk) = 0 then excluded.bhk else crm_leads.bhk end,
                localities = coalesce(crm_leads.localities, excluded.localities),
                budget = coalesce(crm_leads.budget, excluded.budget),
                lead_source = coalesce(crm_leads.lead_source, excluded.lead_source),
                source_detail = coalesce(crm_leads.source_detail, excluded.source_detail),
                last_signal_at = now(),
                last_activity_at = case when crm_leads.stage in ('lost', 'not-reachable')
                                         and crm_leads.owner_id is not null
                                        then now() else crm_leads.last_activity_at end,
                failed_attempts = case when crm_leads.stage in ('lost', 'not-reachable')
                                       then 0 else crm_leads.failed_attempts end,
                stage = case when crm_leads.stage in ('lost', 'not-reachable') then 'new' else crm_leads.stage end
            where crm_leads.stage <> 'do-not-call'
            returning id, (xmax = 0) as created
            """;

    private static final String LEAD_ID = "select id from crm_leads where mobile = ?";

    private static final String SIGNAL = """
            insert into crm_lead_signals (lead_id, source, source_ref, service, summary) values (?, ?, ?, ?, ?)
            on conflict (source, source_ref) do nothing
            """;

    private record Account(UUID id, String role, boolean archived, String name) {
    }

    private final JdbcTemplate jdbc;

    LeadIngest(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    static boolean validMobile(String mobile) {
        return mobile != null && VALID_MOBILE.matcher(mobile).matches();
    }

    Optional<Landed> ingest(Incoming in) {
        String mobile = MobileMask.normalise(in.mobile());
        if (!validMobile(mobile) || seen(in)) {
            return Optional.empty();
        }
        Optional<Account> account = jdbc.query(ACCOUNT, (rs, i) -> new Account(rs.getObject("id", UUID.class),
                rs.getString("role"), rs.getBoolean("archived"), rs.getString("name")), mobile).stream().findFirst();
        if (account.filter(a -> a.archived() || isBackOffice(a.role())).isPresent()) {
            return Optional.empty();
        }
        String name = blankToNull(in.name());
        UUID userId = account.map(Account::id).orElse(null);
        if (name == null) {
            name = account.map(Account::name).map(LeadIngest::blankToNull).orElse(null);
        }
        LeadProfile p = in.profile() == null ? LeadProfile.NONE : in.profile();
        Object[] args = {mobile, userId, name, in.interests().toArray(String[]::new), p.leadType(), p.intent(),
            p.propertyTypes().toArray(String[]::new), p.bhk().toArray(String[]::new), p.localities(), p.budget(),
            p.leadSource(), p.sourceDetail()};
        Landed landed = jdbc.query(UPSERT, (rs, i) -> new Landed(rs.getObject("id", UUID.class),
                rs.getBoolean("created")), args).stream().findFirst().orElseGet(() -> closedLead(mobile));
        String service = in.interests().isEmpty() ? null : in.interests().get(0);
        jdbc.update(SIGNAL, landed.leadId(), in.source(), in.ref(), service, in.summary());
        return Optional.of(landed);
    }

    private boolean seen(Incoming in) {
        return Boolean.TRUE.equals(jdbc.queryForObject(SIGNAL_SEEN, Boolean.class, in.source(), in.ref()));
    }

    private Landed closedLead(String mobile) {
        return new Landed(jdbc.queryForObject(LEAD_ID, UUID.class, mobile), false);
    }

    private static boolean isBackOffice(String role) {
        return "staff".equals(role) || "manager".equals(role) || "admin".equals(role);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

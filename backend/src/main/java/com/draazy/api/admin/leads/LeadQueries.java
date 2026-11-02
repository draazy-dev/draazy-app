package com.draazy.api.admin.leads;

import static com.draazy.api.admin.leads.LeadRecords.instant;

import com.draazy.api.admin.leads.LeadViews.Activity;
import com.draazy.api.admin.leads.LeadViews.Assignee;
import com.draazy.api.admin.leads.LeadViews.Conversion;
import com.draazy.api.admin.leads.LeadViews.Convertible;
import com.draazy.api.admin.leads.LeadViews.LeadDetail;
import com.draazy.api.admin.leads.LeadViews.LeadSummary;
import com.draazy.api.admin.leads.LeadViews.Signal;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.persistence.LikePatterns;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.PageResponse;
import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LeadQueries {
    static final Duration COOLDOWN = Duration.ofHours(24);
    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<String> VIEWS = Set.of("mine", "pool", "all", "search");

    private record Base(LeadSummary summary, UUID userId, String mobile) {
    }

    private static final String DUE = """
            (l.owner_id is not null and l.stage in ('new', 'contacted', 'interested')
             and (l.next_follow_up_at <= now() or (l.next_follow_up_at is null and l.last_contact_at is null)))
            """;

    private static final String SELECT = """
            select l.id, l.name, l.mobile, l.stage, l.interests, l.owner_id, o.name as owner_name,
                   l.next_follow_up_at, l.last_contact_at, l.last_signal_at, l.failed_attempts, l.user_id,
                   l.lead_type, l.intent, l.property_types, l.bhk, l.localities, l.budget, l.lead_source,
                   l.source_detail,
                   (np.marketing_consent_at is not null) as opted_in,
                   """ + DUE + """
                   as due,
                   coalesce((select array_agg(distinct s.source order by s.source)
                               from crm_lead_signals s where s.lead_id = l.id), '{}') as sources
              from crm_leads l
              left join users o on o.id = l.owner_id
              left join notification_preferences np on np.user_id = l.user_id
            """;

    private static final String WHERE = """
             where ((? = 'mine' and l.owner_id = ?)
                 or (? = 'pool' and l.owner_id is null and l.stage not in ('do-not-call', 'converted'))
                 or ? = 'all'
                 or (? = 'search' and (lower(coalesce(l.name, '')) like ? or l.mobile like ?)))
               and (cast(? as text) is null or l.stage = cast(? as text))
               and (cast(? as text) is null or l.lead_type = cast(? as text))
            """;

    private static final String ORDER = """
             order by (? = 'mine' and l.stage in ('new', 'contacted', 'interested')) desc,
                      (? = 'mine' and """ + DUE + """
                      ) desc,
                      (case when ? = 'mine' then l.next_follow_up_at end) asc nulls last,
                      l.last_signal_at desc, l.id
             limit ? offset ?
            """;

    private static final String LIST = SELECT + WHERE + ORDER;
    private static final String COUNT = "select count(*) from crm_leads l " + WHERE;
    private static final String COUNTS = """
            select count(*) filter (where l.owner_id = ? and l.stage in ('new', 'contacted', 'interested')) as mine,
                   count(*) filter (where l.owner_id = ? and """ + DUE + """
                   ) as due,
                   count(*) filter (where l.owner_id is null and l.stage not in ('do-not-call', 'converted'))
                       as pool
              from crm_leads l
            """;

    private static final String SIGNALS = """
            select source, service, summary, created_at from crm_lead_signals
             where lead_id = ? order by created_at desc, id desc
            """;

    private static final String ACTIVITIES = """
            select a.id, a.kind, a.outcome, a.body, u.name as actor_name, a.created_at
              from crm_lead_activities a left join users u on u.id = a.actor_id
             where a.lead_id = ? order by a.created_at desc, a.id desc
            """;

    private static final String CONVERSIONS = """
            select c.id, c.service_request_id, c.service, c.amount, c.credited_to, u.name as credited_name,
                   c.created_at
              from crm_lead_conversions c left join users u on u.id = c.credited_to
             where c.lead_id = ? order by c.created_at desc, c.id desc
            """;

    private static final String CONVERTIBLE = """
            select r.id, r.type, r.amount, r.status, r.created_at
              from service_requests r
             where r.requester_id = ? and r.status not in ('awaiting-payment', 'cancelled')
               and not exists (select 1 from crm_lead_conversions c where c.service_request_id = r.id)
             order by r.created_at desc
            """;

    private static final String ASSIGNEES = """
            select u.id, coalesce(u.name, 'Staff') as name,
                   (select count(*) from crm_leads l
                     where l.owner_id = u.id and l.stage in ('new', 'contacted', 'interested')) as open_leads
              from users u
             where u.role in ('staff', 'manager', 'admin') and not u.archived
             order by lower(coalesce(u.name, '')), u.id
            """;

    private final JdbcTemplate jdbc;
    private final AccountPermissions permissions;

    LeadQueries(JdbcTemplate jdbc, AccountPermissions permissions) {
        this.jdbc = jdbc;
        this.permissions = permissions;
    }

    @Transactional(readOnly = true)
    public PageResponse<LeadSummary> list(AuthPrincipal caller, String view, String q, String stage, String type,
            int page, int size) {
        String mode = view == null || view.isBlank() ? "mine" : view;
        int pageSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        int pageIndex = Math.max(page, 0);
        if (!VIEWS.contains(mode)) {
            throw new BadRequestException("view must be one of mine, pool, all, search");
        }
        if ("all".equals(mode)) {
            requireManager(caller);
        }
        String pattern = null;
        String digitPattern = null;
        if ("search".equals(mode)) {
            String term = q == null ? "" : q.strip();
            if (term.length() < 3) {
                throw new BadRequestException("Search needs at least 3 characters");
            }
            pattern = LikePatterns.contains(term);
            String digits = term.replaceAll("\\D", "");
            digitPattern = digits.isEmpty() ? null : LikePatterns.contains(digits);
        }
        String stageFilter = stage == null || stage.isBlank() ? null : LeadVocabulary.required(
                LeadVocabulary.STAGES, stage, "stage");
        String typeFilter = type == null || type.isBlank() ? null : LeadVocabulary.required(
                LeadVocabulary.LEAD_TYPES, type, "type");
        Object[] filter = {mode, caller.userId(), mode, mode, mode, pattern, digitPattern, stageFilter, stageFilter,
            typeFilter, typeFilter};
        Long total = jdbc.queryForObject(COUNT, Long.class, filter);
        long totalElements = total == null ? 0 : total;
        List<Object> pageArgs = new ArrayList<>(Arrays.asList(filter));
        pageArgs.addAll(Arrays.asList(mode, mode, mode, pageSize, (long) pageIndex * pageSize));
        List<LeadSummary> rows = jdbc.query(LIST, (rs, i) -> base(rs, caller.userId()).summary(),
                pageArgs.toArray());
        int pages = (int) ((totalElements + pageSize - 1) / pageSize);
        return new PageResponse<>(rows, pageIndex, pageSize, totalElements, pages, null)
                .withCounts(counts(caller.userId()));
    }

    @Transactional(readOnly = true)
    public LeadDetail detail(UUID id, UUID callerId) {
        Base base = jdbc.query(SELECT + " where l.id = ? ", (rs, i) -> base(rs, callerId), id).stream().findFirst()
                .orElseThrow(() -> NotFoundException.of("Lead"));
        LeadSummary s = base.summary();
        List<Signal> signals = jdbc.query(SIGNALS, (rs, i) -> new Signal(rs.getString("source"),
                rs.getString("service"), rs.getString("summary"), instant(rs, "created_at")), id);
        List<Activity> activities = jdbc.query(ACTIVITIES, (rs, i) -> new Activity(rs.getObject("id", UUID.class),
                rs.getString("kind"), rs.getString("outcome"), rs.getString("body"), rs.getString("actor_name"),
                instant(rs, "created_at")), id);
        List<Conversion> conversions = jdbc.query(CONVERSIONS, (rs, i) -> new Conversion(
                rs.getObject("id", UUID.class), rs.getObject("service_request_id", UUID.class),
                rs.getString("service"), rs.getBigDecimal("amount"), rs.getObject("credited_to", UUID.class),
                rs.getString("credited_name"), instant(rs, "created_at")), id);
        String mobile = LeadVocabulary.DO_NOT_CALL.equals(s.stage()) ? null : base.mobile();
        return new LeadDetail(s.id(), s.name(), s.maskedMobile(), mobile, s.stage(), s.interests(), s.sources(),
                s.ownerId(), s.ownerName(), s.mine(), s.nextFollowUpAt(), s.lastContactAt(), s.lastSignalAt(),
                s.failedAttempts(), s.consent(), s.due(), s.profile(), base.userId(), nextContactAfter(s), signals,
                activities, conversions);
    }

    @Transactional(readOnly = true)
    public List<Convertible> convertible(UUID leadId, AuthPrincipal caller) {
        UUID ownerId = jdbc.query("select owner_id from crm_leads where id = ?", (rs, i) ->
                rs.getObject("owner_id", UUID.class), leadId).stream().findFirst()
                .orElseThrow(() -> NotFoundException.of("Lead"));
        if (!caller.userId().equals(ownerId) && !permissions.granted(caller, BackOfficePermissions.LEADS_MANAGE)) {
            throw new ForbiddenException("Only the owner or a manager can see this");
        }
        UUID userId = jdbc.queryForObject("select user_id from crm_leads where id = ?", UUID.class, leadId);
        if (userId == null) {
            return List.of();
        }
        return jdbc.query(CONVERTIBLE, (rs, i) -> new Convertible(rs.getObject("id", UUID.class),
                rs.getString("type"), rs.getBigDecimal("amount"), rs.getString("status"),
                instant(rs, "created_at")), userId);
    }

    @Transactional(readOnly = true)
    public List<Assignee> assignees() {
        return jdbc.query(ASSIGNEES, (rs, i) -> new Assignee(rs.getObject("id", UUID.class), rs.getString("name"),
                rs.getInt("open_leads")));
    }

    boolean isManager(AuthPrincipal caller) {
        return permissions.granted(caller, BackOfficePermissions.LEADS_MANAGE);
    }

    private void requireManager(AuthPrincipal caller) {
        if (!isManager(caller)) {
            throw new ForbiddenException("Managers only");
        }
    }

    private Map<String, Long> counts(UUID callerId) {
        return jdbc.queryForObject(COUNTS, (rs, i) -> Map.of("mine", rs.getLong("mine"), "due", rs.getLong("due"),
                "pool", rs.getLong("pool")), callerId, callerId);
    }

    private static Instant nextContactAfter(LeadSummary s) {
        if (s.lastContactAt() == null || s.due()) {
            return null;
        }
        Instant after = s.lastContactAt().plus(COOLDOWN);
        return after.isAfter(Instant.now()) ? after : null;
    }

    private static Base base(ResultSet rs, UUID callerId) throws SQLException {
        UUID ownerId = rs.getObject("owner_id", UUID.class);
        String[] interests = (String[]) rs.getArray("interests").getArray();
        String[] sources = (String[]) rs.getArray("sources").getArray();
        LeadSummary summary = new LeadSummary(rs.getObject("id", UUID.class), rs.getString("name"),
                MobileMask.mask(rs.getString("mobile")), rs.getString("stage"), List.of(interests),
                List.of(sources), ownerId, rs.getString("owner_name"), callerId.equals(ownerId),
                instant(rs, "next_follow_up_at"), instant(rs, "last_contact_at"), instant(rs, "last_signal_at"),
                rs.getInt("failed_attempts"), rs.getBoolean("opted_in") ? "opted-in" : "service-only",
                rs.getBoolean("due"), profile(rs));
        return new Base(summary, rs.getObject("user_id", UUID.class), rs.getString("mobile"));
    }

    private static LeadProfile profile(ResultSet rs) throws SQLException {
        return new LeadProfile(rs.getString("lead_type"), rs.getString("intent"),
                List.of((String[]) rs.getArray("property_types").getArray()),
                List.of((String[]) rs.getArray("bhk").getArray()), rs.getString("localities"),
                rs.getObject("budget", Long.class), rs.getString("lead_source"), rs.getString("source_detail"));
    }
}

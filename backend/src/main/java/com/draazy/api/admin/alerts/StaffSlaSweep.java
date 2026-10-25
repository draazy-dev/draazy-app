package com.draazy.api.admin.alerts;

import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.Roles;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** One notification per recipient, rule, level and queue per run, so a backlog never floods a bell. Routing and
 * thresholds: docs/system/notifications.md#queue-alerts-sla-reminders-and-escalations. */
@Service
public class StaffSlaSweep {

    private static final Logger log = LoggerFactory.getLogger(StaffSlaSweep.class);

    enum Level {
        ARRIVAL("arrival", "queue."), REMINDER("reminder", "sla."), ESCALATION("escalation", "escalation.");

        final String wire;
        final String typePrefix;

        Level(String wire, String typePrefix) {
            this.wire = wire;
            this.typePrefix = typePrefix;
        }
    }

    /** Wider than one 15-minute tick, so a missed run still announces; narrow enough that a first deploy does not
     * announce the whole backlog. */
    static final Duration ARRIVAL_WINDOW = Duration.ofHours(1);

    static final Duration LOG_RETENTION = Duration.ofDays(90);

    /** Per-stage deadlines (rent agreements) escalate at one and a half times the deadline. */
    private static final double STAGE_ESCALATION_FACTOR = 1.5;

    private final JdbcTemplate jdbc;
    private final UserRepository users;
    private final AccountPermissions permissions;
    private final Notifier notifier;
    private final Environment env;
    private final Clock clock;
    private final TransactionTemplate transactions;

    public StaffSlaSweep(JdbcTemplate jdbc, UserRepository users, AccountPermissions permissions, Notifier notifier,
                         Environment env, Clock clock, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.users = users;
        this.permissions = permissions;
        this.notifier = notifier;
        this.env = env;
        this.clock = clock;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    public long sweepNow() {
        return sweep(clock.instant());
    }

    /** Returns the notifications sent. Each rule commits alone, so one failing queue cannot silence the others. */
    public long sweep(Instant now) {
        Audience audience = transactions.execute(status -> audience());
        long sent = 0;
        for (StaffSlaRule rule : StaffSlaRule.CATALOGUE) {
            try {
                sent += transactions.execute(status -> sweep(rule, audience, now));
            } catch (RuntimeException e) {
                log.error("staff-sla rule {} failed; the next run retries it", rule.name(), e);
            }
        }
        return sent;
    }

    private long sweep(StaffSlaRule rule, Audience audience, Instant now) {
        List<StaffSlaRule.Item> items = items(rule);
        forgetResolved(rule, items, now);
        Set<LogKey> logged = logged(rule);
        Map<Batch, List<StaffSlaRule.Item>> batches = new LinkedHashMap<>();
        for (StaffSlaRule.Item item : items) {
            Level level = levelFor(rule, item, now);
            if (level == null || !firstTime(rule, item, level, now, logged)) {
                continue;
            }
            String link = rule.queueLink().apply(item);
            for (UUID recipient : recipients(rule, item, level, audience)) {
                batches.computeIfAbsent(new Batch(rule, level, recipient, link), k -> new ArrayList<>()).add(item);
            }
        }
        batches.forEach(this::send);
        return batches.size();
    }

    /** Only rows for items that have left the queue expire; a row still in use would re-fire its alert. */
    private void forgetResolved(StaffSlaRule rule, List<StaffSlaRule.Item> items, Instant now) {
        String[] open = items.stream().map(StaffSlaRule.Item::id).toArray(String[]::new);
        jdbc.update("delete from staff_alert_log where rule = ? and sent_at < ? and not (item_id = any(?))", ps -> {
            ps.setString(1, rule.name());
            ps.setTimestamp(2, Timestamp.from(now.minus(LOG_RETENTION)));
            ps.setArray(3, ps.getConnection().createArrayOf("text", open));
        });
    }

    private Set<LogKey> logged(StaffSlaRule rule) {
        return new HashSet<>(jdbc.query("select item_id, level, anchor_at from staff_alert_log where rule = ?",
                (rs, i) -> new LogKey(rs.getString(1), rs.getString(2), rs.getTimestamp(3).toInstant()), rule.name()));
    }

    private List<StaffSlaRule.Item> items(StaffSlaRule rule) {
        return jdbc.query(rule.sql(), (rs, i) -> new StaffSlaRule.Item(rs.getString(1), rs.getString(2),
                rs.getTimestamp(3).toInstant(), rs.getString(4), rs.getObject(5, UUID.class),
                rs.getObject(6, Long.class)));
    }

    private Level levelFor(StaffSlaRule rule, StaffSlaRule.Item item, Instant now) {
        Duration age = Duration.between(item.anchor(), now);
        Duration remind;
        Duration escalate;
        if (item.dueSeconds() != null) {
            remind = Duration.ofSeconds(item.dueSeconds());
            escalate = Duration.ofSeconds(Math.round(item.dueSeconds() * STAGE_ESCALATION_FACTOR));
        } else {
            remind = threshold(rule, "remind", rule.remind());
            escalate = threshold(rule, "escalate", rule.escalate());
        }
        if (age.compareTo(escalate) >= 0) {
            return Level.ESCALATION;
        }
        if (age.compareTo(remind) >= 0) {
            return Level.REMINDER;
        }
        boolean fresh = age.compareTo(ARRIVAL_WINDOW) < 0;
        return rule.announces() && fresh && item.assignee() == null ? Level.ARRIVAL : null;
    }

    private Duration threshold(StaffSlaRule rule, String kind, Duration fallback) {
        return env.getProperty("draazy.staff-sla." + rule.name() + "." + kind, Duration.class, fallback);
    }

    /** Lower levels are logged too, so an item first seen already overdue is never announced afterwards. */
    private boolean firstTime(StaffSlaRule rule, StaffSlaRule.Item item, Level level, Instant now, Set<LogKey> logged) {
        if (logged.contains(new LogKey(item.id(), level.wire, item.anchor()))) {
            return false;
        }
        boolean inserted = false;
        for (Level l : Level.values()) {
            if (l.ordinal() > level.ordinal()) {
                break;
            }
            int rows = jdbc.update("""
                    insert into staff_alert_log (rule, item_id, level, anchor_at, sent_at) values (?, ?, ?, ?, ?)
                    on conflict do nothing
                    """, rule.name(), item.id(), l.wire, Timestamp.from(item.anchor()), Timestamp.from(now));
            inserted = l == level && rows == 1;
        }
        return inserted;
    }

    private List<UUID> recipients(StaffSlaRule rule, StaffSlaRule.Item item, Level level, Audience audience) {
        String function = rule.function().apply(item);
        if (function == null) {
            return audience.admins();
        }
        if (level == Level.ESCALATION) {
            return audience.escalation();
        }
        if (item.assignee() != null && audience.live().contains(item.assignee())) {
            return List.of(item.assignee());
        }
        List<UUID> holders = audience.staffHolding(function);
        return holders.isEmpty() ? audience.escalation() : holders;
    }

    private Audience audience() {
        Map<UUID, Set<String>> staff = new LinkedHashMap<>();
        List<UUID> managers = new ArrayList<>();
        List<UUID> admins = new ArrayList<>();
        Set<UUID> live = new HashSet<>();
        for (User account : users.findBackOfficeAccounts()) {
            if (account.isArchived()) {
                continue;
            }
            live.add(account.getId());
            switch (account.getRole()) {
                case Roles.Wire.STAFF -> staff.put(account.getId(),
                        permissions.functionsFor(account.getRole(), account.getId()));
                case Roles.Wire.MANAGER -> managers.add(account.getId());
                case Roles.Wire.ADMIN -> admins.add(account.getId());
                default -> { }
            }
        }
        return new Audience(staff, managers, admins, live);
    }

    private void send(Batch batch, List<StaffSlaRule.Item> items) {
        StaffSlaRule rule = batch.rule();
        items.sort(Comparator.comparing(StaffSlaRule.Item::anchor));
        int n = items.size();
        String what = n == 1 ? rule.one() : n + " " + rule.many();
        StaffSlaRule.Item oldest = items.get(0);
        String title = switch (batch.level()) {
            case ARRIVAL -> n == 1 ? "New " + rule.one() : n + " new " + rule.many();
            case REMINDER -> "Waiting " + waited(rule, oldest, "remind", rule.remind()) + ": " + what;
            case ESCALATION -> "Escalated: " + what + " untouched "
                    + waited(rule, oldest, "escalate", rule.escalate());
        };
        String body = n == 1 ? oldest.title() : "Oldest: " + oldest.title() + " and " + (n - 1) + " more";
        String link = n == 1 ? rule.itemLink().apply(oldest) : batch.link();
        notifier.notify(batch.recipient(), batch.level().typePrefix + rule.name(), title, body, link);
    }

    private String waited(StaffSlaRule rule, StaffSlaRule.Item item, String kind, Duration fallback) {
        if (item.dueSeconds() != null) {
            return "past its deadline";
        }
        Duration d = threshold(rule, kind, fallback);
        return d.toHours() >= 48 && d.toHours() % 24 == 0 ? d.toDays() + "d+" : d.toHours() + "h+";
    }

    private record Batch(StaffSlaRule rule, Level level, UUID recipient, String link) {
    }

    private record LogKey(String itemId, String level, Instant anchor) {
    }

    private record Audience(Map<UUID, Set<String>> staff, List<UUID> managers, List<UUID> admins, Set<UUID> live) {

        List<UUID> staffHolding(String function) {
            return staff.entrySet().stream().filter(e -> e.getValue().contains(function)).map(Map.Entry::getKey)
                    .toList();
        }

        List<UUID> escalation() {
            return managers.isEmpty() ? admins : managers;
        }
    }
}

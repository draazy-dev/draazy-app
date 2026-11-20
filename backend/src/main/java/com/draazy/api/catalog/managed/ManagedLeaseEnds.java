package com.draazy.api.catalog.managed;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.persistence.Savepoints;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManagedLeaseEnds {
    private static final Logger log = LoggerFactory.getLogger(ManagedLeaseEnds.class);
    static final int REMIND_DAYS_AHEAD = 60;
    static final String TYPE = "lease.ending";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private static final String DUE = """
            select id from managed_properties
             where rented and lease_end between ? and ? and renewal_reminded_at is null
             order by lease_end, id
            """;

    private final ManagedPropertyRepository records;
    private final UserRepository users;
    private final Notifier notifier;
    private final PlatformSettings settings;
    private final JdbcTemplate jdbc;
    private final DataSource dataSource;

    public ManagedLeaseEnds(ManagedPropertyRepository records, UserRepository users, Notifier notifier,
            PlatformSettings settings, JdbcTemplate jdbc, DataSource dataSource) {
        this.records = records;
        this.users = users;
        this.notifier = notifier;
        this.settings = settings;
        this.jdbc = jdbc;
        this.dataSource = dataSource;
    }

    @Transactional
    public int remindEnding(Instant now) {
        LocalDate today = now.atZone(PlatformTime.IST).toLocalDate();
        List<UUID> due = jdbc.queryForList(DUE, UUID.class, today, today.plusDays(REMIND_DAYS_AHEAD));
        int reminded = 0;
        for (ManagedProperty m : records.findAllById(due)) {
            try {
                Savepoints.isolated(dataSource, () -> {
                    remind(m);
                    jdbc.update("update managed_properties set renewal_reminded_at = ? where id = ?",
                            Timestamp.from(now), m.getId());
                });
                reminded++;
            } catch (RuntimeException e) {
                log.warn("Could not send the lease-end reminder for managed home {}", m.getId(), e);
            }
        }
        return reminded;
    }

    private void remind(ManagedProperty m) {
        String fee = "\u20b9" + settings.rentAgreementPlatform();
        String title = "Lease for " + m.getTitle() + " ends on " + DAY.format(m.getLeaseEnd());
        notifier.notify(m.getOwnerId(), TYPE, title,
                "Renew in one tap for " + fee + ", or list it again from " + DAY.format(m.getLeaseEnd())
                        + " if your tenant is moving out.", "/owner-hub/property/" + m.getId());
        if (m.getTenantMobile() == null) {
            return;
        }
        users.findByMobileAndArchivedFalse(m.getTenantMobile()).map(User::getId)
                .filter(id -> !id.equals(m.getOwnerId()))
                .ifPresent(id -> notifier.notify(id, TYPE, title,
                        "Renew with your owner for " + fee + ", or find your next home and movers on Draazy.",
                        "/dashboard#rental"));
    }
}

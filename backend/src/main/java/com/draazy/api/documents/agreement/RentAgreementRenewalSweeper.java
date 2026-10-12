package com.draazy.api.documents.agreement;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Tells both sides of a registered agreement, once, that its term ends within two months. */
@Service
public class RentAgreementRenewalSweeper {

    static final int REMIND_DAYS_AHEAD = 60;
    static final String TYPE = "agreement.renewal";

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    private final RentAgreementRepository agreements;
    private final UserRepository users;
    private final Notifier notifier;
    private final AuditService audit;
    private final PlatformSettings settings;

    public RentAgreementRenewalSweeper(RentAgreementRepository agreements, UserRepository users,
            Notifier notifier, AuditService audit, PlatformSettings settings) {
        this.agreements = agreements;
        this.users = users;
        this.notifier = notifier;
        this.audit = audit;
        this.settings = settings;
    }

    /** One owner notification per service request, however many tenant rows it holds. */
    @Transactional
    public int remindEnding(Instant now) {
        LocalDate today = now.atZone(PlatformTime.IST).toLocalDate();
        List<RentAgreement> due = agreements.findEndingBetween(today, today.plusDays(REMIND_DAYS_AHEAD));
        Map<UUID, List<RentAgreement>> byRequest = new LinkedHashMap<>();
        for (RentAgreement row : due) {
            UUID key = Objects.requireNonNullElse(row.getServiceRequestId(), row.getId());
            byRequest.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
        }
        byRequest.values().forEach(group -> remind(group, now));
        return byRequest.size();
    }

    private void remind(List<RentAgreement> group, Instant now) {
        RentAgreement first = group.get(0);
        LocalDate end = group.stream().map(RentAgreement::endDate).min(Comparator.naturalOrder()).orElseThrow();
        String fee = "\u20b9" + settings.rentAgreementPlatform();
        String title = "Your rent agreement ends on " + DAY.format(end);
        notifier.notify(first.getOwnerId(), TYPE, title,
                "Renew in one tap for " + fee + ", or list the flat again from " + DAY.format(end.plusDays(1))
                        + " if your tenant is moving out.", "/dashboard#documents");

        Set<UUID> tenants = new LinkedHashSet<>();
        for (RentAgreement row : group) {
            String mobile = MobileMask.normalise(row.getTenantMobile());
            if (mobile != null) {
                users.findByMobileAndArchivedFalse(mobile).map(User::getId).ifPresent(tenants::add);
            }
        }
        tenants.remove(first.getOwnerId());
        tenants.forEach(id -> notifier.notify(id, TYPE, title,
                "Renew with your owner on Draazy for " + fee + " \u2014 no broker, no visit.", "/dashboard#rental"));

        group.forEach(row -> row.markRenewalReminded(now));
        agreements.saveAllAndFlush(group);
        audit.record("system", "admin", "rentAgreement.renewalReminder", "rentAgreement",
                first.getId().toString());
    }
}

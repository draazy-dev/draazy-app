package com.draazy.api.catalog.managed;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The tenant's side of an owner's rent tracker, joined on the tenant's own mobile so a later sign-up links itself. */
@Service
public class TrackedRentService {

    static final String TRACKING = "rent.tracking";
    static final String DUE = "rent.due";
    static final String OVERDUE = "rent.overdue";
    static final String RECEIPT = "rent.receipt";
    static final int HEADS_UP_DAYS = 3;
    static final int OVERDUE_DAYS = 5;

    // Must match currentDueStatus() in frontend/src/lib/data/rentReminders.js.
    private static final int DEFAULT_DUE_DAY = 5;
    private static final int TENANT_RECEIPTS = 12;
    private static final String TENANT_LINK = "/dashboard#rental";
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH);

    private final ManagedPropertyRepository records;
    private final ManagedRentReceiptRepository receipts;
    private final ManagedPropertyMapper mapper;
    private final UserRepository users;
    private final Notifier notifier;

    public TrackedRentService(ManagedPropertyRepository records, ManagedRentReceiptRepository receipts,
            ManagedPropertyMapper mapper, UserRepository users, Notifier notifier) {
        this.records = records;
        this.receipts = receipts;
        this.mapper = mapper;
        this.users = users;
        this.notifier = notifier;
    }

    @Transactional(readOnly = true)
    public List<TrackedRentDto> forTenant(UUID tenantId) {
        String mobile = users.findById(tenantId).map(User::getMobile).orElse(null);
        if (mobile == null) {
            return List.of();
        }
        return records.findByTenantMobileAndRentedTrueOrderByCreatedAtDescIdDesc(mobile).stream()
                .filter(m -> m.getMonthlyRent() != null && m.getTenantSince() != null)
                .map(m -> toTenantView(m, LocalDate.now(PlatformTime.IST)))
                .toList();
    }

    private TrackedRentDto toTenantView(ManagedProperty m, LocalDate today) {
        YearMonth month = YearMonth.from(today);
        LocalDate due = month.atDay(dueDay(m));
        String status;
        if (paid(m, month)) {
            status = "paid";
        } else if (due.isBefore(namedOn(m))) {
            status = "due";
            due = month.plusMonths(1).atDay(dueDay(m));
        } else {
            status = today.isAfter(due) ? "overdue" : "due";
        }
        return new TrackedRentDto(m.getId().toString(), m.getTitle(), ManagedRentReceipt.addressOf(m),
                landlordName(m.getOwnerId()), m.getMonthlyRent(), dueDay(m), status, due,
                mapper.toReceiptDtos(receipts.findByManagedPropertyIdAndCreatedAtGreaterThanEqualOrderByRentMonthDesc(
                        m.getId(), m.getTenantSince(), Limit.of(TENANT_RECEIPTS))));
    }

    void announceTenant(ManagedProperty m) {
        tenantOf(m).ifPresent(id -> notifier.notify(id, TRACKING, "Your rent is now on Draazy",
                landlordName(m.getOwnerId()) + " added " + m.getTitle() + " at " + Notifier.rupees(m.getMonthlyRent())
                        + " a month, due on the " + ordinal(dueDay(m)) + ".", TENANT_LINK));
    }

    void announceReceipt(ManagedProperty m, String rentMonth) {
        tenantOf(m).ifPresent(id -> notifier.notify(id, RECEIPT,
                "Rent receipt for " + MONTH.format(YearMonth.parse(rentMonth)),
                "Your owner recorded the rent for " + m.getTitle() + ". Download the receipt any time.",
                TENANT_LINK));
    }

    /** Runs once a day: heads-up to the tenant, due-day nudge to the owner, overdue to both; paid months stay quiet. */
    @Transactional
    public int remindDue(LocalDate today) {
        int reminded = 0;
        for (ManagedProperty m : records.findByRentedTrueAndTenantMobileNotNull()) {
            if (m.getMonthlyRent() == null) {
                continue;
            }
            String rent = Notifier.rupees(m.getMonthlyRent());
            String tenantName = m.getTenantName() == null ? "Your tenant" : m.getTenantName();
            String ownerLink = "/owner-hub/property/" + m.getId();
            Optional<UUID> tenant = tenantOf(m);
            LocalDate headsUp = today.plusDays(HEADS_UP_DAYS);
            LocalDate overdue = today.minusDays(OVERDUE_DAYS);
            if (unpaidDueOn(m, headsUp)) {
                tenant.ifPresent(id -> notifier.notify(id, DUE, "Rent due on " + DAY.format(headsUp),
                        rent + " for " + m.getTitle() + ".", TENANT_LINK));
            } else if (unpaidDueOn(m, today)) {
                notifier.notify(m.getOwnerId(), DUE, "Rent due today from " + tenantName,
                        rent + " for " + m.getTitle() + ". Mark it received once it arrives.", ownerLink);
            } else if (unpaidDueOn(m, overdue)) {
                String title = "Rent overdue since " + DAY.format(overdue);
                notifier.notify(m.getOwnerId(), OVERDUE, title,
                        tenantName + " hasn't paid " + rent + " for " + m.getTitle() + " yet.", ownerLink);
                tenant.ifPresent(id -> notifier.notify(id, OVERDUE, title,
                        rent + " for " + m.getTitle() + " is still unpaid.", TENANT_LINK));
            } else {
                continue;
            }
            reminded++;
        }
        return reminded;
    }

    // A due date before the tenant was named belongs to whoever held the flat then, so it is never theirs to chase.
    private boolean unpaidDueOn(ManagedProperty m, LocalDate day) {
        return day.getDayOfMonth() == dueDay(m) && !day.isBefore(namedOn(m)) && !paid(m, YearMonth.from(day));
    }

    private boolean paid(ManagedProperty m, YearMonth month) {
        return receipts.existsByManagedPropertyIdAndRentMonth(m.getId(), month.toString());
    }

    private static LocalDate namedOn(ManagedProperty m) {
        return m.getTenantSince() == null ? LocalDate.MIN : LocalDate.ofInstant(m.getTenantSince(), PlatformTime.IST);
    }

    private Optional<UUID> tenantOf(ManagedProperty m) {
        return Optional.ofNullable(m.getTenantMobile())
                .flatMap(users::findByMobileAndArchivedFalse)
                .map(User::getId)
                .filter(id -> !id.equals(m.getOwnerId()));
    }

    private String landlordName(UUID ownerId) {
        return users.findById(ownerId).map(User::getName).filter(n -> !n.isBlank()).map(String::trim)
                .orElse("Your owner");
    }

    private static int dueDay(ManagedProperty m) {
        return m.getDueDay() == null ? DEFAULT_DUE_DAY : m.getDueDay();
    }

    private static String ordinal(int day) {
        if (day >= 11 && day <= 13) {
            return day + "th";
        }
        return day + switch (day % 10) {
            case 1 -> "st";
            case 2 -> "nd";
            case 3 -> "rd";
            default -> "th";
        };
    }
}

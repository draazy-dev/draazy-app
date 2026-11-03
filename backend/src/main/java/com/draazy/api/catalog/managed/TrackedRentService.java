package com.draazy.api.catalog.managed;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.web.Ids;
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

@Service
public class TrackedRentService {
    static final String TRACKING = "rent.tracking";
    static final String DUE = "rent.due";
    static final String OVERDUE = "rent.overdue";
    static final String RECEIPT = "rent.receipt";
    static final String CLAIMED = "rent.claimed";
    static final String CLAIM_REJECTED = "rent.claim-rejected";
    static final int HEADS_UP_DAYS = 3;
    static final int OVERDUE_DAYS = 5;

    private static final int DEFAULT_DUE_DAY = 5;
    // Two years, so a tenant can always bundle the whole previous financial year for HRA.
    private static final int TENANT_RECEIPTS = 24;
    private static final String TENANT_LINK = "/dashboard#rental";
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH);
    private static final DateTimeFormatter MONTH = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH);

    private final ManagedPropertyRepository records;
    private final ManagedRentReceiptRepository receipts;
    private final ManagedPropertyMapper mapper;
    private final UserRepository users;
    private final Notifier notifier;
    private final RentClaims claims;

    public TrackedRentService(ManagedPropertyRepository records, ManagedRentReceiptRepository receipts,
            ManagedPropertyMapper mapper, UserRepository users, Notifier notifier, RentClaims claims) {
        this.records = records;
        this.receipts = receipts;
        this.mapper = mapper;
        this.users = users;
        this.notifier = notifier;
        this.claims = claims;
    }

    @Transactional(readOnly = true)
    public List<TrackedRentDto> forTenant(UUID tenantId) {
        String mobile = users.findById(tenantId).map(User::getMobile).orElse(null);
        if (mobile == null) {
            return List.of();
        }
        return records.findByTenantMobileAndRentedTrueOrderByCreatedAtDescIdDesc(mobile).stream()
                .filter(TrackedRentService::tracked)
                .map(m -> toTenantView(m, LocalDate.now(PlatformTime.IST)))
                .toList();
    }

    // Idempotent: a repeat tap neither duplicates the claim nor nags the owner again.
    @Transactional
    public TrackedRentDto claimPaid(UUID tenantId, String id) {
        String mobile = users.findById(tenantId).map(User::getMobile).orElse(null);
        ManagedProperty m = Ids.parseUuid(id).flatMap(records::findById)
                .filter(r -> r.isRented() && tracked(r) && r.getTenantMobile().equals(mobile))
                .orElseThrow(() -> NotFoundException.of("Tracked rent"));
        LocalDate today = LocalDate.now(PlatformTime.IST);
        TrackedRentDto view = toTenantView(m, today);
        if (!"paid".equals(view.status()) && claims.add(m, YearMonth.from(view.dueOn()))) {
            String tenantName = m.getTenantName() == null ? "Your tenant" : m.getTenantName();
            notifier.notify(m.getOwnerId(), CLAIMED, tenantName + " says the rent is paid",
                    Notifier.rupees(m.getMonthlyRent()) + " for " + m.getTitle() + ", "
                            + MONTH.format(YearMonth.from(view.dueOn())) + ". Confirm once it reaches you.",
                    "/owner-hub/property/" + m.getId());
            return toTenantView(m, today);
        }
        return view;
    }

    @Transactional
    public void rejectClaim(UUID ownerId, String id, String rentMonth) {
        ManagedProperty m = Ids.parseUuid(id).flatMap(records::findById)
                .filter(r -> r.getOwnerId().equals(ownerId))
                .orElseThrow(() -> NotFoundException.of("Managed property"));
        if (!claims.remove(m, rentMonth)) {
            throw NotFoundException.of("Rent claim");
        }
        tenantOf(m).ifPresent(tenant -> notifier.notify(tenant, CLAIM_REJECTED,
                "Rent for " + MONTH.format(YearMonth.parse(rentMonth)) + " not received yet",
                landlordName(ownerId) + " hasn't received it for " + m.getTitle() + ". Check the transfer.",
                TENANT_LINK));
    }

    private static boolean tracked(ManagedProperty m) {
        return m.getMonthlyRent() != null && m.getTenantSince() != null && m.getTenantMobile() != null;
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
        if (!"paid".equals(status) && claims.claimed(m, YearMonth.from(due))) {
            status = "claimed";
        }
        return new TrackedRentDto(m.getId().toString(), m.getTitle(), ManagedRentReceipt.addressOf(m),
                landlordName(m.getOwnerId()), m.getMonthlyRent(), dueDay(m), status, due, m.getLeaseEnd(),
                m.getDeposit(), m.getLandlordPan(), ManagedPropertyMapper.policeIntimation(m),
                m.getPoliceIntimatedOn(),
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
            LocalDate headsUp = today.plusDays(HEADS_UP_DAYS);
            LocalDate overdue = today.minusDays(OVERDUE_DAYS);
            if (unpaidDueOn(m, headsUp)) {
                tenantOf(m).ifPresent(id -> notifier.notify(id, DUE, "Rent due on " + DAY.format(headsUp),
                        rent + " for " + m.getTitle() + ".", TENANT_LINK));
            } else if (unpaidDueOn(m, today)) {
                notifier.notify(m.getOwnerId(), DUE, "Rent due today from " + tenantName,
                        rent + " for " + m.getTitle() + ". Mark it received once it arrives.", ownerLink);
            } else if (unpaidDueOn(m, overdue)) {
                String title = "Rent overdue since " + DAY.format(overdue);
                notifier.notify(m.getOwnerId(), OVERDUE, title,
                        tenantName + " hasn't paid " + rent + " for " + m.getTitle() + " yet.", ownerLink);
                tenantOf(m).ifPresent(id -> notifier.notify(id, OVERDUE, title,
                        rent + " for " + m.getTitle() + " is still unpaid.", TENANT_LINK));
            } else {
                continue;
            }
            reminded++;
        }
        return reminded;
    }

    private boolean unpaidDueOn(ManagedProperty m, LocalDate day) {
        return day.getDayOfMonth() == dueDay(m) && !day.isBefore(namedOn(m)) && !paid(m, YearMonth.from(day))
                && !claims.claimed(m, YearMonth.from(day));
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

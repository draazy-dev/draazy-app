package com.draazy.api.finance.ledger;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.finance.tenancy.Tenancy;
import com.draazy.api.finance.tenancy.TenancyRepository;
import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Owner-only, 404 never 403, so a property id's existence is not leaked.
// Dates use PlatformTime.IST: a UTC host lags 5.5 hours and misfiles month ends and 1 April.
@Service
public class FinanceService {
    private static final DateTimeFormatter MONTH_KEY = DateTimeFormatter.ofPattern("yyyy-MM");

    private static final int MAX_CASHFLOW_MONTHS = 60;

    private final TransactionRepository transactions;
    private final OwnershipBasisRepository bases;
    private final TenancyRepository tenancies;
    private final PropertyRepository properties;
    private final FinanceMapper mapper;

    private Clock clock = Clock.systemUTC();

    public FinanceService(TransactionRepository transactions,
                          OwnershipBasisRepository bases,
                          TenancyRepository tenancies,
                          PropertyRepository properties,
                          FinanceMapper mapper) {
        this.transactions = transactions;
        this.bases = bases;
        this.tenancies = tenancies;
        this.properties = properties;
        this.mapper = mapper;
    }

    void useClock(Clock pinned) {
        this.clock = pinned == null ? Clock.systemUTC() : pinned;
    }

    private LocalDate todayIst() {
        return LocalDate.now(clock.withZone(PlatformTime.IST));
    }

    private YearMonth currentMonthIst() {
        return YearMonth.now(clock.withZone(PlatformTime.IST));
    }

    @Transactional(readOnly = true)
    public Page<TransactionDto> listTransactions(UUID callerId, UUID propertyId, Pageable pageable) {
        ownedPropertyId(callerId, propertyId);
        return transactions.findLiveByPropertyId(propertyId, pageable).map(mapper::toDto);
    }

    @Transactional
    public TransactionDto addTransaction(UUID callerId, UUID propertyId,
                                         TransactionCreateRequest body) {
        ownedPropertyId(callerId, propertyId);

        String type = requireValidType(body.type());
        String recurring = normaliseRecurring(body.recurring());

        Transaction row = new Transaction(propertyId, callerId, type, body.amount(), body.date());
        row.setCategory(blankToNull(body.category()));
        row.setNote(blankToNull(body.note()));
        row.setRecurring(recurring);
        return mapper.toDto(transactions.save(row));
    }

    @Transactional
    public TransactionDto updateTransaction(UUID callerId, UUID propertyId, UUID txnId,
                                            TransactionUpdateRequest body) {
        ownedPropertyId(callerId, propertyId);
        Transaction row = transactions.findLiveByIdAndPropertyId(txnId, propertyId)
                .orElseThrow(() -> NotFoundException.of("Transaction"));

        if (body.type() != null) {
            row.setType(requireValidType(body.type()));
        }
        if (body.amount() != null) {
            row.setAmount(body.amount());
        }
        if (body.date() != null) {
            row.setDate(body.date());
        }
        if (body.recurring() != null) {
            row.setRecurring(normaliseRecurring(body.recurring()));
        }
        if (body.category() != null) {
            row.setCategory(blankToNull(body.category()));
        }
        if (body.note() != null) {
            row.setNote(blankToNull(body.note()));
        }
        return mapper.toDto(transactions.save(row));
    }

    @Transactional
    public void deleteTransaction(UUID callerId, UUID propertyId, UUID txnId) {
        ownedPropertyId(callerId, propertyId);
        Transaction row = transactions.findLiveByIdAndPropertyId(txnId, propertyId)
                .orElseThrow(() -> NotFoundException.of("Transaction"));
        row.archive("Deleted by owner");
        transactions.save(row);
    }

    @Transactional(readOnly = true)
    public FinanceOverviewDto overview(UUID callerId, UUID propertyId, Integer months) {
        ownedPropertyId(callerId, propertyId);
        return new FinanceOverviewDto(
                bases.findById(propertyId).map(mapper::toDto).orElse(null),
                duesOf(propertyId),
                cashflowOf(propertyId, months));
    }

    @Transactional
    public OwnershipBasisDto setBasis(UUID callerId, UUID propertyId, OwnershipBasisDto body) {
        ownedPropertyId(callerId, propertyId);
        OwnershipBasis basis = bases.findById(propertyId)
                .orElseGet(() -> new OwnershipBasis(propertyId, callerId));

        basis.setPurchasePrice(requireNonNegative(body.purchasePrice(), "purchasePrice"));
        basis.setPurchaseDate(body.purchaseDate());
        basis.setLoanOutstanding(requireNonNegative(body.loanOutstanding(), "loanOutstanding"));
        basis.setEmi(requireNonNegative(body.emi(), "emi"));
        basis.setCurrentValue(requireNonNegative(body.currentValue(), "currentValue"));
        return mapper.toDto(bases.save(basis));
    }

    @Transactional(readOnly = true)
    public FinanceSummaryDto summary(UUID callerId, UUID propertyId, String period) {
        ownedPropertyId(callerId, propertyId);
        String window = period == null ? SummaryPeriods.ALL : period;
        if (!SummaryPeriods.isValid(window)) {
            throw new BadRequestException("Unknown period: " + window);
        }

        LocalDate today = todayIst();
        LocalDate from = SummaryPeriods.startOf(window, today);

        TransactionRepository.Totals totals = transactions.sumByTypeSince(propertyId, from);
        long income = totals.getIncome();
        long expense = totals.getExpense();

        return new FinanceSummaryDto(income, expense, income - expense,
                occupancyRate(propertyId, from, today));
    }

    private List<CashflowPointDto> cashflowOf(UUID propertyId, Integer months) {
        int window = months == null ? 12 : months;
        if (window < 1 || window > MAX_CASHFLOW_MONTHS) {
            throw new BadRequestException(
                    "months must be between 1 and " + MAX_CASHFLOW_MONTHS);
        }

        YearMonth thisMonth = currentMonthIst();
        YearMonth firstMonth = thisMonth.minusMonths(window - 1L);

        Map<String, long[]> byMonth = new HashMap<>();
        for (Object[] row : transactions.monthlyTotalsBetween(
                propertyId, firstMonth.atDay(1), thisMonth.plusMonths(1).atDay(1))) {
            byMonth.put((String) row[0], new long[]{toLong(row[1]), toLong(row[2])});
        }

        List<CashflowPointDto> series = new ArrayList<>(window);
        for (int i = 0; i < window; i++) {
            YearMonth month = firstMonth.plusMonths(i);
            long[] totals = byMonth.getOrDefault(month.format(MONTH_KEY), new long[]{0L, 0L});
            series.add(new CashflowPointDto(month.format(MONTH_KEY), totals[0], totals[1],
                    totals[0] - totals[1]));
        }
        return series;
    }

    private List<DueDto> duesOf(UUID propertyId) {
        LocalDate today = todayIst();

        return transactions.findLiveRecurringByPropertyId(propertyId).stream()
                .map(row -> {
                    LocalDate nextDue = RecurringIntervals.nextOccurrenceOnOrAfter(
                            row.getDate(), row.getRecurring(), today);
                    return mapper.toDueDto(row, nextDue,
                            ChronoUnit.DAYS.between(today, nextDue));
                })
                .sorted((a, b) -> Long.compare(a.daysUntil(), b.daysUntil()))
                .toList();
    }

    private void ownedPropertyId(UUID callerId, UUID propertyId) {
        if (properties.findByIdAndOwner_Id(propertyId, callerId).isEmpty()) {
            throw NotFoundException.of("Property");
        }
    }

    private Double occupancyRate(UUID propertyId, LocalDate from, LocalDate today) {
        List<Tenancy> history = tenancies.findByPropertyId(propertyId);
        if (history.isEmpty()) {
            return null;
        }

        LocalDate windowStart = from != null ? from : earliestStart(history);
        if (windowStart == null || !windowStart.isBefore(today)) {
            return null;
        }
        long windowDays = ChronoUnit.DAYS.between(windowStart, today);

        long tenantedDays = 0;
        for (Tenancy tenancy : history) {
            LocalDate start = tenancy.getStartDate();
            if (start == null) {
                continue;
            }
            LocalDate end = tenancy.getEndDate() != null ? tenancy.getEndDate() : today;
            LocalDate overlapStart = start.isAfter(windowStart) ? start : windowStart;
            LocalDate overlapEnd = end.isBefore(today) ? end : today;
            if (overlapStart.isBefore(overlapEnd)) {
                tenantedDays += ChronoUnit.DAYS.between(overlapStart, overlapEnd);
            }
        }
        return Math.min(1.0, (double) tenantedDays / windowDays);
    }

    private static LocalDate earliestStart(List<Tenancy> history) {
        return history.stream()
                .map(Tenancy::getStartDate)
                .filter(d -> d != null)
                .min(LocalDate::compareTo)
                .orElse(null);
    }

    private static String requireValidType(String type) {
        if (!TransactionTypes.isValid(type)) {
            throw new BadRequestException(
                    "type must be one of: " + TransactionTypes.INCOME + ", "
                            + TransactionTypes.EXPENSE);
        }
        return type;
    }

    private static String normaliseRecurring(String recurring) {
        if (recurring == null) {
            return RecurringIntervals.NONE;
        }
        if (!RecurringIntervals.isValid(recurring)) {
            throw new BadRequestException("Unknown recurring interval: " + recurring);
        }
        return recurring;
    }

    private static Long requireNonNegative(Long value, String field) {
        if (value != null && value < 0) {
            throw new BadRequestException(field + " must not be negative");
        }
        return value;
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static long toLong(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }
}

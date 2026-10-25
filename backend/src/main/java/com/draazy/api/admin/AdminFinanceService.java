package com.draazy.api.admin;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.persistence.LikePatterns;
import com.draazy.api.common.web.PageResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminFinanceService {

    // The console offers 6, 12 and 24; the extra headroom is for an operator typing a range by hand.
    private static final int MAX_FINANCE_MONTHS = 60;

    private static final int MAX_LEDGER_PAGE = 100;

    private static final long MAX_LEDGER_OFFSET = 100_000L;

    // A contract enum, not a query result: an unknown kind is a 400, not an empty page.
    private static final List<String> LEDGER_KINDS = List.of("subscription", "service", "refund");

    // Includes the tiebreaks so the page envelope matches the stable SQL order.
    private static final Sort LEDGER_SORT = Sort.by(Sort.Order.desc("date").nullsLast(),
            Sort.Order.desc("number"), Sort.Order.asc("id"));

    private final AdminMetricsRepository metrics;

    public AdminFinanceService(AdminMetricsRepository metrics) {
        this.metrics = metrics;
    }

    @Transactional(readOnly = true)
    public AdminFinance finance() {
        LocalDate monthStart = LocalDate.now(PlatformTime.IST).withDayOfMonth(1);
        List<AdminFinance.PlanLine> plans = metrics.subscriptionPlanLines().stream()
                .map(row -> new AdminFinance.PlanLine(
                        (String) row[0],
                        (String) row[1],
                        (String) row[2],
                        ((Number) row[3]).longValue(),
                        ((Number) row[4]).longValue(),
                        ((Number) row[5]).longValue(),
                        row[6] == null ? null : ((Number) row[6]).intValue()))
                .toList();
        return new AdminFinance(metrics.mrr(), plans,
                metrics.money(monthStart, monthStart.plusMonths(1)), metrics.attention());
    }

    @Transactional(readOnly = true)
    public List<AdminFinanceSeriesPoint> financeSeries(int months) {
        if (months < 1 || months > MAX_FINANCE_MONTHS) {
            throw new BadRequestException(
                    "months must be between 1 and " + MAX_FINANCE_MONTHS);
        }
        LocalDate thisMonth = LocalDate.now(PlatformTime.IST).withDayOfMonth(1);
        LocalDate from = thisMonth.minusMonths(months - 1L);

        Map<LocalDate, long[]> observed = new HashMap<>();
        for (Object[] row : metrics.feeSeries(from, thisMonth.plusMonths(1))) {
            long[] bands = observed.computeIfAbsent(BucketDate.of(row[0]), key -> new long[3]);
            bands["subscription".equals(row[1]) ? 0 : 1] += ((Number) row[2]).longValue();
            bands[2] += ((Number) row[3]).longValue();
        }

        List<AdminFinanceSeriesPoint> points = new ArrayList<>();
        for (LocalDate cursor = from; !cursor.isAfter(thisMonth); cursor = cursor.plusMonths(1)) {
            long[] bands = observed.getOrDefault(cursor, new long[3]);
            points.add(new AdminFinanceSeriesPoint(cursor, bands[0], bands[1], bands[2]));
        }
        return List.copyOf(points);
    }

    @Transactional(readOnly = true)
    public PageResponse<AdminFinanceTransaction> financeTransactions(
            String kind, String q, Integer days, int page, int size) {
        if (kind != null && !LEDGER_KINDS.contains(kind)) {
            throw new BadRequestException("kind must be one of " + LEDGER_KINDS);
        }
        int safeSize = Math.clamp(size, 1, MAX_LEDGER_PAGE);
        int safePage = Math.max(page, 0);

        // Widened before multiplying, and capped after.
        // The long prevents overflow; the cap prevents pointless full ledger scans.
        long offset = (long) safePage * safeSize;
        if (offset > MAX_LEDGER_OFFSET) {
            throw new BadRequestException(
                    "page is beyond the ledger; at most " + MAX_LEDGER_OFFSET + " rows may be skipped");
        }

        // Escaped before wrapping: an operator searching for a party with an underscore or a
        // percent in the name would otherwise be running a wildcard they did not type.
        String term = (q == null || q.isBlank()) ? null : "%" + LikePatterns.escape(q.trim()) + "%";

        Instant since = PlatformTime.sinceOrNull(days);
        LocalDate sinceDay = since == null ? null : LocalDate.ofInstant(since, PlatformTime.IST);

        long total = metrics.ledgerCount(kind, term, sinceDay);
        List<AdminFinanceTransaction> rows = metrics
                .ledger(kind, term, sinceDay, safeSize, offset).stream()
                .map(row -> new AdminFinanceTransaction(
                        (UUID) row[0],
                        BucketDate.of(row[1]),
                        (String) row[2],
                        (String) row[3],
                        (String) row[4],
                        ((Number) row[5]).longValue(),
                        ((Number) row[6]).longValue()))
                .toList();
        return PageResponse.of(
                new PageImpl<>(rows, PageRequest.of(safePage, safeSize, LEDGER_SORT), total),
                Function.identity());
    }
}
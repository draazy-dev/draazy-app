package com.draazy.api.admin;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.moderation.report.ReportService;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import java.time.LocalDate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminMetricsService {

    private static final int REVENUE_WINDOW_DAYS = 30;

    private final AdminMetricsRepository metrics;
    private final ReportService reports;

    public AdminMetricsService(AdminMetricsRepository metrics, ReportService reports) {
        this.metrics = metrics;
        this.reports = reports;
    }

    // Seven counts and one money figure, deliberately unbatched.
    @Transactional(readOnly = true)
    public AdminKpis dashboard(AuthPrincipal caller) {
        boolean admin = Roles.Wire.ADMIN.equals(caller.role());

        // Read once: two calls either side of midnight would open a 32-day window, and the pair
        // straddling it is exactly the case nobody would ever reproduce.
        LocalDate today = LocalDate.now(PlatformTime.IST);
        return new AdminKpis(
                metrics.countListings(null),
                metrics.countListings("approved"),
                metrics.countListings("pending"),
                reports.openCount(),
                metrics.countUsers(null),
                metrics.countUsers(7),
                metrics.countDealsClosed(30),
                admin ? metrics.money(today.minusDays(REVENUE_WINDOW_DAYS), today.plusDays(1)).net()
                        : null);
    }
}

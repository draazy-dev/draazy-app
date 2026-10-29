package com.draazy.api.admin;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.Capabilities;
import com.draazy.api.security.Roles;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminPageViewAnalyticsController {
    private static final String ANALYTICS_READ =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')"
                    + " and " + Capabilities.REQUIRE_VIEW_DASHBOARD
                    + " and " + BackOfficePermissions.REQUIRE_ANALYTICS_READ;

    private final AdminPageViewAnalyticsService service;

    public AdminPageViewAnalyticsController(AdminPageViewAnalyticsService service) {
        this.service = service;
    }

    @GetMapping(Routes.Admin.ANALYTICS_TRAFFIC)
    @PreAuthorize(ANALYTICS_READ)
    public AdminAnalyticsTraffic traffic(@RequestParam(required = false) Integer days) {
        return service.traffic(days);
    }

    @GetMapping(Routes.Admin.ANALYTICS_ENGAGEMENT)
    @PreAuthorize(ANALYTICS_READ)
    public AdminAnalyticsEngagement engagement(@RequestParam(required = false) Integer days) {
        return service.engagement(days);
    }

    @GetMapping(Routes.Admin.ANALYTICS_SURFERS)
    @PreAuthorize(ANALYTICS_READ)
    public AdminAnalyticsSurfers surfers(@RequestParam(required = false) Integer days) {
        return service.surfers(days);
    }
}

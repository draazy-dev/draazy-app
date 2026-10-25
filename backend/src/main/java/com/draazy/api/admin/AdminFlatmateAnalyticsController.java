package com.draazy.api.admin;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.Capabilities;
import com.draazy.api.security.Roles;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /admin/analytics/flatmates}, guarded like the other analytics reads. */
@RestController
public class AdminFlatmateAnalyticsController {

    private static final String ANALYTICS_READ =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')"
                    + " and " + Capabilities.REQUIRE_VIEW_DASHBOARD
                    + " and " + BackOfficePermissions.REQUIRE_ANALYTICS_READ;

    private final AdminFlatmateAnalyticsService service;

    public AdminFlatmateAnalyticsController(AdminFlatmateAnalyticsService service) {
        this.service = service;
    }

    @GetMapping(Routes.Admin.ANALYTICS_FLATMATES)
    @PreAuthorize(ANALYTICS_READ)
    public AdminAnalyticsFlatmates flatmates(@RequestParam(required = false) Integer days) {
        return service.report(days);
    }
}

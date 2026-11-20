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
public class AdminSlaController {
    private static final String SLA_READ =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')"
                    + " and " + Capabilities.REQUIRE_VIEW_DASHBOARD
                    + " and " + BackOfficePermissions.REQUIRE_ANALYTICS_READ;

    private final AdminSlaService service;

    public AdminSlaController(AdminSlaService service) {
        this.service = service;
    }

    @GetMapping(Routes.Admin.ANALYTICS_SLA)
    @PreAuthorize(SLA_READ)
    public SlaSummary sla(@RequestParam(required = false) Integer days) {
        return service.report(days);
    }
}

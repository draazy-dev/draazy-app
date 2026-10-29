package com.draazy.api.admin;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.Capabilities;
import com.draazy.api.security.Roles;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// Keep staff-guarded as analytics, never public: the unserved-demand map is the platform's
// most commercially sensitive data.
@RestController
public class AdminSupplyGapController {
    private static final String SUPPLY_GAP_READ =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')"
                    + " and " + Capabilities.REQUIRE_VIEW_DASHBOARD
                    + " and " + BackOfficePermissions.REQUIRE_ANALYTICS_READ;

    private final AdminSupplyGapService service;

    public AdminSupplyGapController(AdminSupplyGapService service) {
        this.service = service;
    }

    @GetMapping(Routes.Admin.SUPPLY_GAP)
    @PreAuthorize(SUPPLY_GAP_READ)
    public List<SupplyGapRow> supplyGap(@RequestParam(required = false) Integer days) {
        return service.report(days);
    }
}

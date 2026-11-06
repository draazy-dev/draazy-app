package com.draazy.api.catalog.locality;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ServedAreaAdminController {

    private static final String STAFF_OR_ADMIN = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "') and ";

    private static final String READ = STAFF_OR_ADMIN + BackOfficePermissions.REQUIRE_LOCALITIES_READ;

    private static final String WRITE = STAFF_OR_ADMIN + BackOfficePermissions.REQUIRE_LOCALITIES_WRITE;

    private final ServedAreaAdmin servedArea;

    public ServedAreaAdminController(ServedAreaAdmin servedArea) {
        this.servedArea = servedArea;
    }

    @GetMapping(Routes.ServedArea.ADMIN)
    @PreAuthorize(READ)
    public ServedAreaReport report() {
        return servedArea.report();
    }

    @PostMapping(Routes.ServedArea.ADMIN_RECHECK)
    @PreAuthorize(WRITE)
    public ServedAreaReport.Recheck recheck(@CurrentUser AuthPrincipal principal) {
        return servedArea.recheck(principal);
    }
}

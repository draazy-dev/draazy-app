package com.draazy.api.admin;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminSettingsController {
    private static final String ADMIN_ONLY = "hasRole('" + Roles.ADMIN + "')";
    private static final String BACK_OFFICE = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.MANAGER + "', '"
            + Roles.ADMIN + "')";
    private static final String SETTINGS_READ =
            ADMIN_ONLY + " and " + BackOfficePermissions.REQUIRE_SETTINGS_READ;
    private static final String SETTINGS_WRITE =
            ADMIN_ONLY + " and " + BackOfficePermissions.REQUIRE_SETTINGS_WRITE;

    private final AdminSettingsService service;

    public AdminSettingsController(AdminSettingsService service) {
        this.service = service;
    }

    @GetMapping(Routes.Admin.SETTINGS)
    @PreAuthorize(SETTINGS_READ)
    public ResponseEntity<Map<String, Object>> current() {
        SettingsDocument settings = service.current();
        return ResponseEntity.ok().eTag(settings.etag()).body(settings.body());
    }

    @GetMapping(Routes.Admin.SETTINGS_FLAGS)
    @PreAuthorize(BACK_OFFICE)
    public Map<String, Object> flags() {
        return service.adminFlags();
    }

    @PutMapping(Routes.Admin.SETTINGS)
    @PreAuthorize(SETTINGS_WRITE)
    public ResponseEntity<Map<String, Object>> update(@CurrentUser AuthPrincipal principal,
            @RequestHeader(value = HttpHeaders.IF_MATCH, required = false) String ifMatch,
            @RequestBody Map<String, Object> patch) {
        SettingsDocument saved = service.update(principal, patch, ifMatch);
        return ResponseEntity.ok().eTag(saved.etag()).body(saved.body());
    }
}

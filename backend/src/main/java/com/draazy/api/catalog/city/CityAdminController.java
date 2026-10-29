package com.draazy.api.catalog.city;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.Capabilities;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CityAdminController {
    private static final String ADMIN_ONLY = "hasRole('" + Roles.ADMIN + "')";
    private static final String SETTINGS_WRITE =
            ADMIN_ONLY + " and " + BackOfficePermissions.REQUIRE_SETTINGS_WRITE;
    private static final String ANALYTICS_READ =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')"
                    + " and " + Capabilities.REQUIRE_VIEW_DASHBOARD
                    + " and " + BackOfficePermissions.REQUIRE_ANALYTICS_READ;

    private final CityAdminService cities;

    public CityAdminController(CityAdminService cities) {
        this.cities = cities;
    }

    @GetMapping(Routes.Admin.CITY_WAITLIST)
    @PreAuthorize(ANALYTICS_READ)
    public List<CityWaitlistDemandRow> waitlist() {
        return cities.expansionDemand();
    }

    @PatchMapping(Routes.Admin.CITY_BY_SLUG)
    @PreAuthorize(SETTINGS_WRITE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@CurrentUser AuthPrincipal principal,
            @PathVariable String slug,
            @Valid @RequestBody CityAdminUpdateRequest request) {
        cities.updateLive(slug, request, principal);
    }
}

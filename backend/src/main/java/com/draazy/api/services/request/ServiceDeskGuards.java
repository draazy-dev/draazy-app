package com.draazy.api.services.request;

import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.Roles;

final class ServiceDeskGuards {

    private ServiceDeskGuards() {
    }

    static final String OPS = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "') and ";
    static final String SERVICES_READ = OPS + BackOfficePermissions.REQUIRE_SERVICES_READ;
    static final String SERVICES_WRITE = OPS + BackOfficePermissions.REQUIRE_SERVICES_WRITE;
}

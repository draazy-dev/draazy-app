package com.draazy.api.catalog.society;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SocietyAdminController {
    private static final String STAFF_OR_ADMIN =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')";

    private static final String SOCIETIES_WRITE =
            STAFF_OR_ADMIN + " and " + BackOfficePermissions.REQUIRE_SOCIETIES_WRITE;

    private static final String SOCIETIES_READ =
            STAFF_OR_ADMIN + " and " + BackOfficePermissions.REQUIRE_SOCIETIES_READ;

    private final SocietyAdminService societies;

    public SocietyAdminController(SocietyAdminService societies) {
        this.societies = societies;
    }

    @GetMapping(Routes.AdminSocieties.BASE)
    @PreAuthorize(SOCIETIES_READ)
    public PageResponse<SocietyDirectoryRow> directory(@RequestParam(required = false) String q,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(societies.directory(q, pageable), row -> row);
    }

    @GetMapping(Routes.AdminSocieties.BY_SLUG)
    @PreAuthorize(SOCIETIES_READ)
    public SocietyAdminResponse get(@PathVariable String slug) {
        return societies.get(slug);
    }

    @PatchMapping(Routes.AdminSocieties.BY_SLUG)
    @PreAuthorize(SOCIETIES_WRITE)
    public SocietyAdminResponse edit(@CurrentUser AuthPrincipal principal,
            @PathVariable String slug,
            @Valid @RequestBody SocietyAdminEditRequest request) {
        return societies.edit(slug, request, principal);
    }
}

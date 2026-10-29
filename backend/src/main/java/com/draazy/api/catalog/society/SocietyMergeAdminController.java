package com.draazy.api.catalog.society;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SocietyMergeAdminController {
    private static final String STAFF_OR_ADMIN =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')";

    private static final String SOCIETIES_READ =
            STAFF_OR_ADMIN + " and " + BackOfficePermissions.REQUIRE_SOCIETIES_READ;

    private static final String SOCIETIES_WRITE =
            STAFF_OR_ADMIN + " and " + BackOfficePermissions.REQUIRE_SOCIETIES_WRITE;

    private final SocietyMergeService merges;

    public SocietyMergeAdminController(SocietyMergeService merges) {
        this.merges = merges;
    }

    @GetMapping(Routes.SocietyMerges.BASE)
    @PreAuthorize(SOCIETIES_READ)
    public PageResponse<SocietyMergeResponse> list(@CurrentUser AuthPrincipal principal,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(merges.list(Pageables.unsorted(pageable)), m -> m);
    }

    @PostMapping(Routes.SocietyMerges.BASE)
    @PreAuthorize(SOCIETIES_WRITE)
    @ResponseStatus(HttpStatus.CREATED)
    public SocietyMergeResponse merge(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody SocietyMergeRequest request) {
        return merges.merge(request, principal);
    }

    @DeleteMapping(Routes.SocietyMerges.BY_SLUG)
    @PreAuthorize(SOCIETIES_WRITE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void undo(@CurrentUser AuthPrincipal principal, @PathVariable String slug) {
        merges.undo(slug, principal);
    }
}

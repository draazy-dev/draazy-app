package com.draazy.api.services.support;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.verification.IdentityAppealInfo;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class IdentityAppealController {

    private static final String IDENTITY_WRITE = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "') and "
            + BackOfficePermissions.REQUIRE_IDENTITY_WRITE;

    private final IdentityAppealService service;

    public IdentityAppealController(IdentityAppealService service) {
        this.service = service;
    }

    @PostMapping(Routes.Verification.IDENTITY_APPEAL)
    @ResponseStatus(HttpStatus.CREATED)
    public IdentityAppealInfo open(@CurrentUser AuthPrincipal principal, @RequestBody IdentityAppealRequest body) {
        return service.open(principal, body);
    }

    @PostMapping(Routes.Moderation.IDENTITY_REVIEW_APPEAL_UPHOLD)
    @PreAuthorize(IDENTITY_WRITE)
    public IdentityAppealInfo uphold(@CurrentUser AuthPrincipal principal, @PathVariable UUID id) {
        return service.uphold(principal, id);
    }

    @PostMapping(Routes.Moderation.IDENTITY_REVIEW_APPEAL_REOPEN)
    @PreAuthorize(IDENTITY_WRITE)
    public IdentityAppealInfo reopen(@CurrentUser AuthPrincipal principal, @PathVariable UUID id) {
        return service.reopen(principal, id);
    }
}

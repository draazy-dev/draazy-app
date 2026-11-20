package com.draazy.api.billing.entitlement;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeEntitlementsController {
    private final EntitlementService entitlements;

    public MeEntitlementsController(EntitlementService entitlements) {
        this.entitlements = entitlements;
    }

    @GetMapping(Routes.Plans.ENTITLEMENTS)
    public EntitlementsDto mine(@CurrentUser AuthPrincipal principal) {
        return entitlements.forUser(principal.userId());
    }
}

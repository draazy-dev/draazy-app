package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Authenticated but not role-gated: every read is keyed by the caller's own account, so falling through to
 * {@code anyRequest().authenticated()} in {@code SecurityConfig} is intentional. */
@RestController
public class FlatmateOwnerHomeController {

    private final FlatmateOwnerHomeService service;

    public FlatmateOwnerHomeController(FlatmateOwnerHomeService service) {
        this.service = service;
    }

    @GetMapping(Routes.Flatmates.OWNER_HOMES)
    public List<OwnerHomeDto> homes(@CurrentUser AuthPrincipal principal) {
        return service.list(principal.userId());
    }

    @GetMapping(Routes.Flatmates.OWNER_HOME_PREFILL)
    public OwnerHomePrefillDto prefill(@CurrentUser AuthPrincipal principal, @PathVariable String managedId) {
        return service.prefill(principal.userId(), managedId);
    }
}

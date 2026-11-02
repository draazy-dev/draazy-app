package com.draazy.api.catalog.managed;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeTrackedRentController {
    private final TrackedRentService service;

    public MeTrackedRentController(TrackedRentService service) {
        this.service = service;
    }

    @GetMapping(Routes.MeManagedProperties.TRACKED_RENT)
    public List<TrackedRentDto> mine(@CurrentUser AuthPrincipal principal) {
        return service.forTenant(principal.userId());
    }

    @PostMapping(Routes.MeManagedProperties.TRACKED_RENT_PAID)
    public TrackedRentDto claimPaid(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return service.claimPaid(principal.userId(), id);
    }
}

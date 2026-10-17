package com.draazy.api.catalog.managed;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeTrackedRentController {

    private final TrackedRentService service;

    public MeTrackedRentController(TrackedRentService service) {
        this.service = service;
    }

    /** {@code GET /me/tracked-rent}: homes whose owner tracks rent against the caller's mobile. */
    @GetMapping(Routes.MeManagedProperties.TRACKED_RENT)
    public List<TrackedRentDto> mine(@CurrentUser AuthPrincipal principal) {
        return service.forTenant(principal.userId());
    }
}

package com.draazy.api.engagement.demand;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DemandSignalController {
    private final DemandSignalService service;

    public DemandSignalController(DemandSignalService service) {
        this.service = service;
    }

    @PostMapping(Routes.DemandSignals.BASE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void record(@Valid @RequestBody DemandSignalCreate body,
                       @CurrentUser AuthPrincipal principal) {
        service.record(body, principal);
    }
}

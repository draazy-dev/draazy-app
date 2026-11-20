package com.draazy.api.identity.user.export;

import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class DataExportController {
    // Public because WriteRateLimitFilter names this path and a test asserts they agree; a
    // mismatch would fail the rate limit open.
    public static final String ME_DATA_EXPORT = "/me/data-export";

    private final DataExportService service;

    DataExportController(DataExportService service) {
        this.service = service;
    }

    @GetMapping(ME_DATA_EXPORT)
    public DataExportResponse export(@CurrentUser AuthPrincipal principal) {
        return service.exportFor(principal.userId());
    }
}

package com.draazy.api.engagement.clienterror;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.WriteRateLimitFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** {@code POST /client-errors}: the browser's crash report. Anonymous allowed, write-only, always 204. */
@RestController
public class ClientErrorController {

    private final ClientErrorService service;

    public ClientErrorController(ClientErrorService service) {
        this.service = service;
    }

    @PostMapping(Routes.ClientErrors.BASE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void record(@Valid @RequestBody ClientErrorRequest body, @CurrentUser AuthPrincipal principal,
            HttpServletRequest request) {
        String caller = principal != null ? "u:" + principal.userId()
                : "ip:" + WriteRateLimitFilter.anonymousKey(request.getRemoteAddr());
        service.record(body, principal, caller);
    }
}

package com.draazy.api.finance.tenancy;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TenancyDeclarationController {
    private final TenancyDeclarationService service;

    public TenancyDeclarationController(TenancyDeclarationService service) {
        this.service = service;
    }

    @PostMapping(Routes.Tenancies.DECLARATIONS)
    public ResponseEntity<TenancyDeclarationDto> declare(@CurrentUser AuthPrincipal principal,
            @PathVariable("propId") UUID propId,
            @Valid @RequestBody TenancyDeclarationCreateRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.declare(principal.userId(), propId, body));
    }

    @GetMapping(Routes.Tenancies.DECLARATIONS)
    public PageResponse<TenancyDeclarationDto> forProperty(@CurrentUser AuthPrincipal principal,
            @PathVariable("propId") UUID propId,
            @PageableDefault(size = 20) Pageable pageable) {
        return service.forProperty(principal.userId(), propId, Pageables.unsorted(pageable));
    }

    @PostMapping(Routes.Tenancies.DECLARATION_CONFIRM)
    public TenancyDeclarationDto confirm(@CurrentUser AuthPrincipal principal,
            @PathVariable("id") UUID id) {
        return service.confirm(principal, id);
    }

    @PostMapping(Routes.Tenancies.DECLARATION_REVOKE)
    public TenancyDeclarationDto revoke(@CurrentUser AuthPrincipal principal,
            @PathVariable("id") UUID id) {
        return service.revoke(principal, id);
    }
}

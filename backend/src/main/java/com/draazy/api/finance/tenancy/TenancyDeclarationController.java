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

// No @PreAuthorize: authorisation is a relationship, not a role. The service compares the caller to the owner and
// answers 404 on every refusal so no declaration id is confirmed to exist to a stranger.
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

    // Paged: the owner's list grows with strangers' claims. A claimant's own view is one row on page 0.
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

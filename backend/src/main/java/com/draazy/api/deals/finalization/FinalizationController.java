package com.draazy.api.deals.finalization;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Buyer proposes to finalize a deal, the owner accepts or declines; scoping by party is the gate, not a role. */
@RestController
public class FinalizationController {

    private final FinalizationService finalizationService;

    public FinalizationController(FinalizationService finalizationService) {
        this.finalizationService = finalizationService;
    }

    /** Buyer requests finalization for a listing. */
    @PostMapping(Routes.Finalization.REQUEST)
    public FinalizationRequestDto requestFinalization(
            @CurrentUser AuthPrincipal principal,
            @PathVariable("propId") String propId,
            @Valid @RequestBody FinalizationCreateRequest body) {
        return finalizationService.request(principal.userId(), parseUuid(propId), body);
    }

    /** The caller's request for this property; 204 when there is none. */
    @GetMapping(Routes.Finalization.STATUS)
    public ResponseEntity<FinalizationRequestDto> finalizationStatus(
            @CurrentUser AuthPrincipal principal,
            @PathVariable("propId") String propId) {
        return finalizationService.status(principal.userId(), parseUuid(propId))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** The initiator soft-cancels their own request. */
    @DeleteMapping(Routes.Finalization.STATUS)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelFinalization(
            @CurrentUser AuthPrincipal principal,
            @PathVariable("propId") String propId) {
        finalizationService.cancel(principal.userId(), parseUuid(propId));
    }

    /** Requests awaiting the caller's decision, newest first, paged; the sort is fixed server-side. */
    @GetMapping(Routes.Finalization.ME_REQUESTS)
    public PageResponse<FinalizationRequestDto> myFinalizationRequests(
            @CurrentUser AuthPrincipal principal,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(
                finalizationService.myRequests(principal.userId(), Pageables.unsorted(pageable)),
                r -> r);
    }

    /** The counterparty accepts; sibling requests are declined and the deal closes. */
    @PostMapping(Routes.Finalization.ACCEPT)
    public void acceptFinalization(
            @CurrentUser AuthPrincipal principal,
            @PathVariable("reqId") String reqId) {
        finalizationService.accept(principal.userId(), parseUuid(reqId));
    }

    /** The counterparty declines. */
    @PostMapping(Routes.Finalization.DECLINE)
    public void declineFinalization(
            @CurrentUser AuthPrincipal principal,
            @PathVariable("reqId") String reqId) {
        finalizationService.decline(principal.userId(), parseUuid(reqId));
    }

    private static UUID parseUuid(String token) {
        return Ids.parseUuid(token)
                .orElseThrow(() -> NotFoundException.of("Finalization request"));
    }
}

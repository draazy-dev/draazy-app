package com.draazy.api.identity.user.erasure;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** DPDP right to erasure: the subject files unprivileged, but only an admin decides (irreversible). */
@RestController
public class ErasureController {

    /** {@code POST}/{@code GET} — the subject's own erasure requests. */
    static final String ME_ERASURE = "/me/erasure";

    /** {@code GET} — the admin queue. */
    static final String ADMIN_ERASURE_REQUESTS = "/admin/erasure-requests";

    /** {@code PATCH} — decide one. */
    static final String ADMIN_ERASURE_REQUEST_BY_ID = "/admin/erasure-requests/{id}";

    private static final String ADMIN_ONLY = "hasRole('" + Roles.ADMIN + "')";

    private final ErasureService erasure;

    public ErasureController(ErasureService erasure) {
        this.erasure = erasure;
    }

    // Subject comes from the principal, never the body: a target id would let anyone erase any user.
    @PostMapping(ME_ERASURE)
    @ResponseStatus(HttpStatus.CREATED)
    public ErasureRequestResponse request(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody ErasureCreateRequest body) {
        return erasure.request(principal, body.reason());
    }

    // Pending and rejected only: completing a request erases the subject id it would be scoped by.
    @GetMapping(ME_ERASURE)
    public PageResponse<ErasureRequestResponse> mine(@CurrentUser AuthPrincipal principal,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(erasure.mine(principal, Pageables.unsorted(pageable)), dto -> dto);
    }

    /** {@code GET /admin/erasure-requests} (contract {@code listErasureRequests}) — admin only. */
    @GetMapping(ADMIN_ERASURE_REQUESTS)
    @PreAuthorize(ADMIN_ONLY)
    public PageResponse<ErasureRequestResponse> queue(
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer days,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(erasure.queue(status, days, Pageables.unsorted(pageable)), dto -> dto);
    }

    // Admin-only: an executed erasure is irreversible, unlike every other moderation action.
    @PatchMapping(ADMIN_ERASURE_REQUEST_BY_ID)
    @PreAuthorize(ADMIN_ONLY)
    public ErasureRequestResponse decide(@CurrentUser AuthPrincipal principal,
            @PathVariable String id,
            @Valid @RequestBody ErasureDecisionRequest body) {
        return erasure.decide(principal, id, body.decision(), body.note());
    }
}

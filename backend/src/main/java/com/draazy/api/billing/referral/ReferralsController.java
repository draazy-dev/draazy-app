package com.draazy.api.billing.referral;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReferralsController {
    private static final String STAFF_OR_ADMIN = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "') and ";
    private static final String READ = STAFF_OR_ADMIN + BackOfficePermissions.REQUIRE_REFERRALS_READ;
    private static final String WRITE = STAFF_OR_ADMIN + BackOfficePermissions.REQUIRE_REFERRALS_WRITE;

    private final ReferralService service;
    private final ReferralInvites invites;

    public ReferralsController(ReferralService service, ReferralInvites invites) {
        this.service = service;
        this.invites = invites;
    }

    @GetMapping(Routes.Referrals.MINE)
    public ReferralSummaryDto mine(@CurrentUser AuthPrincipal principal,
            HttpServletRequest request) {
        return service.summary(principal, request);
    }

    @PostMapping(Routes.Referrals.INVITES)
    public ReferralInviteResponse invite(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody InviteRequest body, HttpServletRequest request) {
        return invites.invite(principal, body.mobile(), request);
    }

    @PostMapping(Routes.Referrals.REDEEM)
    public void redeem(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody RedeemRequest body, HttpServletRequest request) {
        service.redeem(principal, body.code(), body.shareChannel(), request);
    }

    @GetMapping(Routes.Referrals.BASE)
    @PreAuthorize(READ)
    public PageResponse<ReferralDto> queue(@RequestParam(required = false) String status,
            @RequestParam(required = false) String risk,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Integer days,
            @RequestParam(defaultValue = "false") boolean counts,
            @PageableDefault(size = 20) Pageable pageable) {
        PageResponse<ReferralDto> page = PageResponse.of(
                service.queue(status, risk, q, days, Pageables.unsorted(pageable)), dto -> dto);
        return counts ? page.withCounts(service.queueCounts()) : page;
    }

    @PostMapping(Routes.Referrals.APPROVE)
    @PreAuthorize(WRITE)
    public ReferralDto approve(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @RequestBody(required = false) ReasonRequest body) {
        return service.approve(principal, id, body == null ? null : body.reason());
    }

    @PostMapping(Routes.Referrals.REJECT)
    @PreAuthorize(WRITE)
    public ReferralDto reject(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @RequestBody(required = false) ReasonRequest body) {
        return service.reject(principal, id, body == null ? null : body.reason());
    }

    @PostMapping(Routes.Referrals.CLAWBACK)
    @PreAuthorize(WRITE)
    public ReferralDto clawback(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @RequestBody(required = false) ReasonRequest body) {
        return service.clawback(principal, id, body == null ? null : body.reason());
    }

    public record RedeemRequest(@NotBlank String code, String shareChannel) {
    }

    public record InviteRequest(String mobile) {
    }

    public record ReasonRequest(String reason) {
    }
}

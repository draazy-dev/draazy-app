package com.draazy.api.billing.refund;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The refunds desk (contracts {@code listRefunds}, {@code approveRefund}, {@code rejectRefund}). */
@RestController
public class RefundsController {

    private static final String STAFF_OR_ADMIN = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "') and ";
    private static final String READ = STAFF_OR_ADMIN + BackOfficePermissions.REQUIRE_REFUNDS_READ;
    private static final String WRITE = STAFF_OR_ADMIN + BackOfficePermissions.REQUIRE_REFUNDS_WRITE;

    private final RefundDesk desk;
    private final RefundDecisions decisions;

    public RefundsController(RefundDesk desk, RefundDecisions decisions) {
        this.desk = desk;
        this.decisions = decisions;
    }

    @GetMapping(Routes.Refunds.DESK)
    @PreAuthorize(READ)
    public PageResponse<RefundDesk.Row> list(@RequestParam(required = false) String status,
            @RequestParam(defaultValue = "false") boolean counts,
            @PageableDefault(size = 20) Pageable pageable) {
        PageResponse<RefundDesk.Row> page = PageResponse.of(desk.list(status, Pageables.unsorted(pageable)), row -> row);
        return counts ? page.withCounts(desk.counts()) : page;
    }

    @PostMapping(Routes.Refunds.APPROVE)
    @PreAuthorize(WRITE)
    public RefundDesk.Row approve(@CurrentUser AuthPrincipal principal, @PathVariable UUID id) {
        return desk.row(decisions.approve(principal, id));
    }

    @PostMapping(Routes.Refunds.REJECT)
    @PreAuthorize(WRITE)
    public RefundDesk.Row reject(@CurrentUser AuthPrincipal principal, @PathVariable UUID id,
            @RequestBody(required = false) RejectBody body) {
        return desk.row(decisions.reject(principal, id, body == null ? null : body.reason()));
    }

    public record RejectBody(String reason) {
    }
}
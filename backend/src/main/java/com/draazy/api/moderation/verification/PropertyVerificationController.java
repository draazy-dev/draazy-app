package com.draazy.api.moderation.verification;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.data.domain.Pageable;
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

@RestController
public class PropertyVerificationController {
    private static final String STAFF_OR_ADMIN =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')";

    private static final String PROPERTIES_VERIFY =
            STAFF_OR_ADMIN + " and " + BackOfficePermissions.REQUIRE_PROPERTIES_VERIFY;

    private final PropertyVerificationService service;
    private final PropertyReviewQueue queue;
    private final PropertyReraCheckService reraChecks;

    public PropertyVerificationController(PropertyVerificationService service,
            PropertyReviewQueue queue, PropertyReraCheckService reraChecks) {
        this.service = service;
        this.queue = queue;
        this.reraChecks = reraChecks;
    }

    @GetMapping(Routes.Moderation.PROPERTY_VERIFICATION)
    public PropertyReviewResponse get(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return service.get(principal, id);
    }

    @GetMapping(Routes.Moderation.ME_PROPERTY_REVIEWS)
    public PageResponse<ReviewBadge> listMyCases(
            @CurrentUser AuthPrincipal principal, Pageable pageable) {
        return PageResponse.of(queue.listMyCases(principal, Pageables.unsorted(pageable)), badge -> badge);
    }

    @PostMapping(Routes.Moderation.PROPERTY_VERIFICATION)
    @ResponseStatus(HttpStatus.CREATED)
    public PropertyReviewResponse initiate(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @RequestParam(defaultValue = "false") boolean markRead) {
        return service.initiate(principal, id, markRead);
    }

    @PostMapping(Routes.Moderation.VERIFICATION_MESSAGES)
    @ResponseStatus(HttpStatus.CREATED)
    public PropertyReviewResponse addMessage(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody MessageRequest body) {
        return service.addMessage(principal, id, body.body(), Boolean.TRUE.equals(body.clarificationRequested()));
    }

    @PostMapping(Routes.Moderation.PROPERTY_VERIFICATION + "/start")
    @PreAuthorize(PROPERTIES_VERIFY)
    public PropertyReviewResponse start(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return service.start(principal, id);
    }

    @PostMapping(Routes.Moderation.VERIFICATION_READ)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        service.markRead(principal, id);
    }

    @PostMapping(Routes.Moderation.VERIFICATION_DECISION)
    @PreAuthorize(PROPERTIES_VERIFY)
    public PropertyReviewResponse decide(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody DecisionRequest body) {
        return service.decide(principal, id, body.decision(), body.note(),
                body.reasonCode(), body.expectedStatus());
    }

    @PatchMapping(Routes.Moderation.VERIFICATION_CHECKLIST)
    @PreAuthorize(PROPERTIES_VERIFY)
    public PropertyReviewResponse setChecklistItem(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody ChecklistUpdate body) {
        return service.setChecklistItem(principal, id, body.item(), Boolean.TRUE.equals(body.pass()));
    }

    @PostMapping(Routes.Moderation.PROPERTY_RERA_CHECK)
    @PreAuthorize(PROPERTIES_VERIFY)
    public PropertyReviewResponse recordReraCheck(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody ReraCheckRequest body) {
        return reraChecks.record(principal, id, body.result());
    }

    public record MessageRequest(@NotBlank @Size(max = 4000) String body, Boolean clarificationRequested) {
    }

    @RejectionNeedsReason
    public record DecisionRequest(@NotBlank String decision, @Size(max = 2000) String note,
            String reasonCode, String expectedStatus) {
    }

    public record ChecklistUpdate(@NotBlank String item, Boolean pass) {
    }

    public record ReraCheckRequest(@NotBlank String result) {
    }
}

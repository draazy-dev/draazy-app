package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class FlatmateApplicationController {
    private final FlatmateApplicationService service;

    public FlatmateApplicationController(FlatmateApplicationService service) {
        this.service = service;
    }

    @GetMapping(Routes.Flatmates.MY_GROUPS)
    public PageResponse<FlatmateGroupCard> myGroups(@CurrentUser AuthPrincipal principal,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(service.myGroups(principal, Pageables.unsorted(pageable)), dto -> dto);
    }

    @PostMapping(Routes.Flatmates.GROUP_APPLY)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('" + Roles.BUYER + "', '" + Roles.OWNER + "')")
    public GroupApplicationDto apply(@CurrentUser AuthPrincipal principal, @PathVariable UUID id,
            @Valid @RequestBody ApplyRequest body) {
        return service.apply(principal, id, body.listingId());
    }

    @GetMapping(Routes.Flatmates.MY_GROUP_APPLICATIONS)
    public PageResponse<GroupApplicationDto> inbox(@CurrentUser AuthPrincipal principal,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(service.inbox(principal, Pageables.unsorted(pageable)), dto -> dto);
    }

    @PatchMapping(Routes.Flatmates.MY_GROUP_APPLICATION_BY_ID)
    @PreAuthorize("hasAnyRole('" + Roles.BUYER + "', '" + Roles.OWNER + "')")
    public GroupApplicationDto decide(@CurrentUser AuthPrincipal principal, @PathVariable UUID id,
            @Valid @RequestBody DecisionRequest body) {
        return service.decide(principal, id, body.status());
    }

    public record ApplyRequest(@NotNull UUID listingId) {
    }

    public record DecisionRequest(@NotBlank String status) {
    }
}

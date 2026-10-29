package com.draazy.api.catalog.society;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.Roles;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SocietyCandidateAdminController {
    private static final String STAFF_OR_ADMIN =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')";

    private static final String SOCIETIES_READ =
            STAFF_OR_ADMIN + " and " + BackOfficePermissions.REQUIRE_SOCIETIES_READ;

    private final SocietyMintService minting;

    public SocietyCandidateAdminController(SocietyMintService minting) {
        this.minting = minting;
    }

    @GetMapping(Routes.SocietyCandidates.BASE)
    @PreAuthorize(SOCIETIES_READ)
    public PageResponse<SocietyCandidateResponse> queue(@RequestParam(required = false) String q,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(minting.candidates(q, Pageables.unsorted(pageable)), s -> s);
    }

    @GetMapping(Routes.SocietyCandidates.DUPLICATES)
    @PreAuthorize(SOCIETIES_READ)
    public List<SocietyDuplicateSuggestion> duplicates(@PathVariable String slug,
            @RequestParam(defaultValue = "6") int limit) {
        return minting.duplicates(slug, limit);
    }
}

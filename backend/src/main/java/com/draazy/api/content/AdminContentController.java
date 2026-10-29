package com.draazy.api.content;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import java.util.List;
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

// A method-level @PreAuthorize replaces the class one,
// so every per-method expression must repeat the role term.
@RestController
@PreAuthorize("hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')")
public class AdminContentController {
    private static final String STAFF_OR_ADMIN =
            "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')";
    private static final String CONTENT_READ =
            STAFF_OR_ADMIN + " and " + BackOfficePermissions.REQUIRE_CONTENT_READ;
    private static final String CONTENT_WRITE =
            STAFF_OR_ADMIN + " and " + BackOfficePermissions.REQUIRE_CONTENT_WRITE;

    private final AdminContentService service;

    public AdminContentController(AdminContentService service) {
        this.service = service;
    }

    @GetMapping(Routes.Admin.CONTENT)
    @PreAuthorize(CONTENT_READ)
    public List<ContentItem> list(@PathVariable String type,
            @RequestParam(required = false) Boolean archived,
            @RequestParam(defaultValue = "false") boolean translations) {
        return service.list(type, archived, translations);
    }

    @PostMapping(Routes.Admin.CONTENT)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CONTENT_WRITE)
    public ContentItem create(@CurrentUser AuthPrincipal principal, @PathVariable String type,
            @Valid @RequestBody ContentWrite body) {
        return service.create(principal, type, body);
    }

    @PatchMapping(Routes.Admin.CONTENT_ITEM)
    @PreAuthorize(CONTENT_WRITE)
    public ContentItem update(@CurrentUser AuthPrincipal principal, @PathVariable String type,
            @PathVariable String id, @Valid @RequestBody ContentWrite body) {
        return service.update(principal, type, id, body);
    }

    @PostMapping(Routes.Admin.CONTENT_ARCHIVE)
    @PreAuthorize(CONTENT_WRITE)
    public ContentItem archive(@CurrentUser AuthPrincipal principal, @PathVariable String type,
            @PathVariable String id) {
        return service.archive(principal, type, id);
    }

    @PostMapping(Routes.Admin.CONTENT_RESTORE)
    @PreAuthorize(CONTENT_WRITE)
    public ContentItem restore(@CurrentUser AuthPrincipal principal, @PathVariable String type,
            @PathVariable String id) {
        return service.restore(principal, type, id);
    }
}

package com.draazy.api.moderation.errorlog;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// Admin-only: stacks and request paths are operational detail, not for the wider back office.
@RestController
public class ErrorLogController {

    private static final String GUARD = "hasRole('" + Roles.ADMIN + "') and "
            + BackOfficePermissions.REQUIRE_AUDIT_READ;
    private static final Set<String> SOURCES = Set.of("api", "job", "web");

    private final ErrorLogRepository repository;
    private final AuditService audit;

    public ErrorLogController(ErrorLogRepository repository, AuditService audit) {
        this.repository = repository;
        this.audit = audit;
    }

    @GetMapping(Routes.Admin.ERROR_LOG)
    @PreAuthorize(GUARD)
    public PageResponse<ErrorEventSummary> list(
            @RequestParam(required = false) String source,
            @RequestParam(defaultValue = "open") String status,
            @RequestParam(required = false) String q,
            @PageableDefault(size = 20) Pageable pageable) {
        String sourceFilter = source == null || source.isBlank() ? null : source.toLowerCase(Locale.ROOT);
        if (sourceFilter != null && !SOURCES.contains(sourceFilter)) {
            throw new BadRequestException("source must be api, job or web");
        }
        return PageResponse.of(
                repository.search(sourceFilter, parseStatus(status), q, Pageables.unsorted(pageable)),
                row -> row);
    }

    @GetMapping(Routes.Admin.ERROR_LOG_BY_ID)
    @PreAuthorize(GUARD)
    public ErrorEventDetail get(@PathVariable String id) {
        return repository.find(parseId(id)).orElseThrow(ErrorLogController::notFound);
    }

    @PostMapping(Routes.Admin.ERROR_LOG_RESOLVE)
    @PreAuthorize(GUARD)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(@PathVariable String id, @CurrentUser AuthPrincipal admin) {
        UUID eventId = parseId(id);
        if (!repository.resolve(eventId, admin.userId())) {
            throw notFound();
        }
        audit.record(admin, "error-log.resolve", "error_event", eventId.toString());
    }

    private static ErrorLogRepository.Status parseStatus(String status) {
        try {
            return ErrorLogRepository.Status.valueOf(status.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknown) {
            throw new BadRequestException("status must be open, resolved or all");
        }
    }

    private static UUID parseId(String token) {
        return Ids.parseUuid(token).orElseThrow(ErrorLogController::notFound);
    }

    private static NotFoundException notFound() {
        return new NotFoundException("Error event not found");
    }
}

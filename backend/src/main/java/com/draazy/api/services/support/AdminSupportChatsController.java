package com.draazy.api.services.support;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import com.draazy.api.services.support.StaffSupportChatDto.Assign;
import com.draazy.api.services.support.StaffSupportChatDto.Counts;
import com.draazy.api.services.support.StaffSupportChatDto.Detail;
import com.draazy.api.services.support.StaffSupportChatDto.Located;
import com.draazy.api.services.support.StaffSupportChatDto.Row;
import com.draazy.api.services.support.StaffSupportChatDto.ServiceTicketCreated;
import com.draazy.api.services.support.StaffSupportChatDto.ServiceTicketPost;
import com.draazy.api.services.support.SupportChatDto.Msg;
import com.draazy.api.services.support.SupportChatDto.Post;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
public class AdminSupportChatsController {
    private static final String STAFF = "hasAnyRole('" + Roles.STAFF + "', '" + Roles.ADMIN + "')";

    private final StaffSupportChatService service;
    private final SupportChatDeskLinks deskLinks;

    public AdminSupportChatsController(StaffSupportChatService service, SupportChatDeskLinks deskLinks) {
        this.service = service;
        this.deskLinks = deskLinks;
    }

    @GetMapping(Routes.Admin.SUPPORT_CHATS_LOCATE)
    @PreAuthorize(STAFF)
    public Located locate(@CurrentUser AuthPrincipal principal, @RequestParam String type, @RequestParam String id) {
        return deskLinks.locate(principal, type, id);
    }

    @PostMapping(Routes.Admin.SUPPORT_CHAT_SERVICE_TICKET)
    @PreAuthorize(STAFF)
    @ResponseStatus(HttpStatus.CREATED)
    public ServiceTicketCreated serviceTicket(@CurrentUser AuthPrincipal principal, @PathVariable UUID userId,
            @Valid @RequestBody ServiceTicketPost body) {
        return deskLinks.createServiceTicket(principal, userId, body);
    }

    @GetMapping(Routes.Admin.SUPPORT_CHATS)
    @PreAuthorize(STAFF)
    public PageResponse<Row> list(@CurrentUser AuthPrincipal principal,
            @RequestParam(defaultValue = "all") String view,
            @RequestParam(required = false) String context,
            @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(service.list(principal, view, context, pageable), row -> row);
    }

    @GetMapping(Routes.Admin.SUPPORT_CHATS_COUNTS)
    @PreAuthorize(STAFF)
    public Counts counts(@CurrentUser AuthPrincipal principal) {
        return service.counts(principal);
    }

    @GetMapping(Routes.Admin.SUPPORT_CHATS_STREAM)
    @PreAuthorize(STAFF)
    public ResponseEntity<SseEmitter> stream(@CurrentUser AuthPrincipal principal) {
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .header("X-Accel-Buffering", "no")
                .header(HttpHeaders.CACHE_CONTROL, "no-cache")
                .body(service.stream(principal));
    }

    @GetMapping(Routes.Admin.SUPPORT_CHAT)
    @PreAuthorize(STAFF)
    public Detail detail(@CurrentUser AuthPrincipal principal, @PathVariable UUID userId) {
        return service.detail(principal, userId);
    }

    @PostMapping(Routes.Admin.SUPPORT_CHAT_MESSAGES)
    @PreAuthorize(STAFF)
    @ResponseStatus(HttpStatus.CREATED)
    public Msg send(@CurrentUser AuthPrincipal principal, @PathVariable UUID userId,
            @Valid @RequestBody Post body) {
        return service.send(principal, userId, body);
    }

    @PostMapping(Routes.Admin.SUPPORT_CHAT_ASSIGN)
    @PreAuthorize(STAFF)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void assign(@CurrentUser AuthPrincipal principal, @PathVariable UUID userId,
            @RequestBody(required = false) Assign body) {
        service.assign(principal, userId, body == null ? null : body.assigneeId());
    }

    @PostMapping(Routes.Admin.SUPPORT_CHAT_RESOLVE)
    @PreAuthorize(STAFF)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void resolve(@CurrentUser AuthPrincipal principal, @PathVariable UUID userId) {
        service.resolve(principal, userId);
    }

    @PostMapping(Routes.Admin.SUPPORT_CHAT_READ)
    @PreAuthorize(STAFF)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markRead(@CurrentUser AuthPrincipal principal, @PathVariable UUID userId) {
        service.markRead(principal, userId);
    }
}

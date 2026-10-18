package com.draazy.api.engagement.requests;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RequestInboxController {

    private final RequestInboxService inbox;
    private final RequestReminderService reminders;

    public RequestInboxController(RequestInboxService inbox, RequestReminderService reminders) {
        this.inbox = inbox;
        this.reminders = reminders;
    }

    @GetMapping(Routes.MeRequests.BASE)
    public PageResponse<RequestItem> list(@CurrentUser AuthPrincipal principal,
            @RequestParam(defaultValue = RequestInboxService.RECEIVED) String box,
            @PageableDefault(size = 50) Pageable pageable) {
        return PageResponse.of(inbox.list(principal.userId(), box, Pageables.unsorted(pageable)), item -> item);
    }

    @PostMapping(Routes.MeRequests.REMINDERS)
    @ResponseStatus(HttpStatus.CREATED)
    public RequestReminderResponse remind(@CurrentUser AuthPrincipal principal, @PathVariable String kind,
            @PathVariable String id) {
        return reminders.remind(principal.userId(), kind, requestId(id));
    }

    @DeleteMapping(Routes.MeRequests.BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@CurrentUser AuthPrincipal principal, @PathVariable String kind, @PathVariable String id) {
        inbox.remove(principal.userId(), kind, requestId(id));
    }

    private static UUID requestId(String token) {
        return Ids.parseUuid(token).orElseThrow(() -> NotFoundException.of("Request"));
    }
}

package com.draazy.api.services.request;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ServiceRequestCorrectionsController {
    private final ServiceRequestAttention attention;
    private final ServiceRequestDeskEdits deskEdits;

    public ServiceRequestCorrectionsController(ServiceRequestAttention attention,
            ServiceRequestDeskEdits deskEdits) {
        this.attention = attention;
        this.deskEdits = deskEdits;
    }

    @PostMapping(Routes.ServiceRequests.ATTENTION)
    @PreAuthorize(ServiceDeskGuards.SERVICES_WRITE)
    public ServiceRequestDto askServiceRequestAttention(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody AttentionRequest body) {
        return attention.ask(principal, id, body.party(), body.reason(), body.papers());
    }

    @PostMapping(Routes.ServiceRequests.ATTENTION_RESOLVE)
    public ServiceRequestDto resolveServiceRequestAttention(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody(required = false) ResolveRequest body) {
        return attention.resolve(principal, id, body == null ? null : body.note());
    }

    @PutMapping(Routes.ServiceRequests.DESK_DETAILS)
    @PreAuthorize(ServiceDeskGuards.SERVICES_WRITE)
    public ServiceRequestDto editServiceRequestDetails(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody DeskDetailsRequest body) {
        return deskEdits.edit(principal, id, body.state(), body.note());
    }

    @PutMapping(Routes.ServiceRequests.DESK_IDENTITIES)
    @PreAuthorize(ServiceDeskGuards.SERVICES_WRITE)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void correctServiceRequestIdentities(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @Valid @RequestBody ServiceRequestIdentitiesRequest body) {
        deskEdits.correctIdentities(principal, id, body.parties());
    }

    public record AttentionRequest(@NotBlank @Size(max = 16) String party,
            @Size(max = ServiceRequestAttention.REASON_MAX) String reason,
            @Size(max = ServiceRequestAttention.PAPERS_MAX) List<@Size(max = 64) String> papers) {
    }

    public record ResolveRequest(@Size(max = ServiceRequestAttention.REASON_MAX) String note) {
    }

    public record DeskDetailsRequest(@NotEmpty Map<String, Object> state,
            @Size(max = ServiceRequestDeskEdits.NOTE_MAX) String note) {
    }
}

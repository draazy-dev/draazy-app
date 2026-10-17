package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import com.draazy.api.security.Roles;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The role guard keeps staff from hosting; ownership of the listing is checked in the service. */
@RestController
public class FlatSplitController {

    private final FlatSplitService service;

    public FlatSplitController(FlatSplitService service) {
        this.service = service;
    }

    @PostMapping(Routes.Properties.SPLIT)
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasAnyRole('" + Roles.BUYER + "', '" + Roles.OWNER + "')")
    public FlatSplitResult split(@CurrentUser AuthPrincipal principal, @PathVariable UUID id,
            @Valid @RequestBody FlatSplitRequest body) {
        return service.split(principal, id, body);
    }

    @DeleteMapping(Routes.Properties.SPLIT)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize("hasAnyRole('" + Roles.BUYER + "', '" + Roles.OWNER + "')")
    public void unsplit(@CurrentUser AuthPrincipal principal, @PathVariable UUID id) {
        service.unsplit(principal, id);
    }
}

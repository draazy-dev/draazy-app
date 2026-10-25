package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** Not under the public detail routes: answers are shown to signed-in people only. */
@RestController
public class FlatmateLivingStyleController {

    private final FlatmateLivingStyleService service;

    public FlatmateLivingStyleController(FlatmateLivingStyleService service) {
        this.service = service;
    }

    @GetMapping(Routes.Flatmates.LIVING_STYLE)
    public FlatmateLivingStyleService.Response livingStyle(@CurrentUser AuthPrincipal principal,
            @PathVariable String kind, @PathVariable UUID id) {
        return service.forItem(principal, kind, id);
    }
}

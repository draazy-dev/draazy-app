package com.draazy.api.engagement.livingstyle;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** {@code /me/living-style} — optional answers about how the caller lives, shown to flatmate matches. */
@RestController
public class LivingStyleController {

    private final LivingStyleService service;

    public LivingStyleController(LivingStyleService service) {
        this.service = service;
    }

    @GetMapping(Routes.Engagement.LIVING_STYLE)
    public LivingStyleDto get(@CurrentUser AuthPrincipal principal) {
        return service.get(principal.userId());
    }

    @PutMapping(Routes.Engagement.LIVING_STYLE)
    public LivingStyleDto put(@CurrentUser AuthPrincipal principal, @RequestBody LivingStyleRequest body) {
        return service.replace(principal.userId(), body);
    }
}

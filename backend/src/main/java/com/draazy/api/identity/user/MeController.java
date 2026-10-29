package com.draazy.api.identity.user;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeController {
    private final UserService userService;
    private final SelfProfile selfProfile;

    public MeController(UserService userService, SelfProfile selfProfile) {
        this.userService = userService;
        this.selfProfile = selfProfile;
    }

    @GetMapping(Routes.Auth.ME)
    public SelfResponse getMe(@CurrentUser AuthPrincipal principal) {
        return selfProfile.of(userService.getMe(principal.userId()));
    }

    @PatchMapping(Routes.Auth.ME)
    public SelfResponse updateMe(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody UserUpdate patch) {
        return selfProfile.of(userService.updateMe(principal.userId(), patch));
    }
}

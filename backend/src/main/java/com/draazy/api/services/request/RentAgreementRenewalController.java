package com.draazy.api.services.request;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RentAgreementRenewalController {
    private final RentAgreementRenewalPrefill prefill;

    public RentAgreementRenewalController(RentAgreementRenewalPrefill prefill) {
        this.prefill = prefill;
    }

    @GetMapping(Routes.MeRentAgreements.RENEWAL)
    public RentAgreementRenewalPrefill.Prefill renewal(@CurrentUser AuthPrincipal principal,
            @PathVariable("id") String id) {
        return prefill.forCaller(principal.userId(), id);
    }

    @GetMapping(Routes.MeRentAgreements.HOME_RENEWAL)
    public RentAgreementRenewalPrefill.Prefill homeRenewal(@CurrentUser AuthPrincipal principal,
            @PathVariable("homeId") String homeId) {
        return prefill.forHome(principal.userId(), homeId);
    }
}

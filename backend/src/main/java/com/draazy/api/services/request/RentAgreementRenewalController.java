package com.draazy.api.services.request;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** {@code GET /me/rent-agreements/{id}/renewal}: the terms a party of a registered agreement renews from. */
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
}

package com.draazy.api.documents.agreement;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeRentAgreementsController {
    private final RentAgreementService agreementService;

    public MeRentAgreementsController(RentAgreementService agreementService) {
        this.agreementService = agreementService;
    }

    @GetMapping(Routes.MeRentAgreements.BASE)
    public List<RentAgreementDto> myRentAgreements(@CurrentUser AuthPrincipal principal) {
        return agreementService.mine(principal.userId());
    }
}

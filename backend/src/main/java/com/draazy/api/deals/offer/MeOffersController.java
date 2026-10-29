package com.draazy.api.deals.offer;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeOffersController {
    private final OfferService offerService;

    public MeOffersController(OfferService offerService) {
        this.offerService = offerService;
    }

    @GetMapping(Routes.Offers.ME)
    public PageResponse<OfferDto> offersOnMine(@CurrentUser AuthPrincipal principal,
                                               @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(
                offerService.offersOnMine(principal.userId(), Pageables.unsorted(pageable)), o -> o);
    }
}

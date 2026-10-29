package com.draazy.api.deals.offer;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.common.web.PageResponse;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OfferController {
    private final OfferService offerService;

    public OfferController(OfferService offerService) {
        this.offerService = offerService;
    }

    @PostMapping(Routes.Offers.BASE)
    @ResponseStatus(HttpStatus.CREATED)
    public OfferDto submitOffer(@CurrentUser AuthPrincipal principal,
                                @Valid @RequestBody OfferCreateRequest body) {
        return offerService.submit(principal.userId(), body);
    }

    @PostMapping(Routes.Offers.RESPOND)
    public void respondOffer(@CurrentUser AuthPrincipal principal,
                             @PathVariable("id") String id,
                             @Valid @RequestBody OfferRespondRequest body) {
        offerService.respond(principal.userId(), parseUuid(id), body);
    }

    @GetMapping(Routes.Offers.MINE)
    public PageResponse<OfferDto> myOffers(@CurrentUser AuthPrincipal principal,
                                           @PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.of(
                offerService.myOffers(principal.userId(), Pageables.unsorted(pageable)), o -> o);
    }

    private static UUID parseUuid(String token) {
        return Ids.parseUuid(token).orElseThrow(() -> NotFoundException.of("Offer"));
    }
}

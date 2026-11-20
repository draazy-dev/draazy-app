package com.draazy.api.finance.rental;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeRentalsController {
    private final TenantRentalService rentalService;

    public MeRentalsController(TenantRentalService rentalService) {
        this.rentalService = rentalService;
    }

    @GetMapping(Routes.Rentals.MINE)
    public List<TenantRentalDto> myRentals(@CurrentUser AuthPrincipal principal) {
        return rentalService.myRentals(principal.userId());
    }

    @PostMapping(Routes.Rentals.MINE)
    @ResponseStatus(HttpStatus.CREATED)
    public TenantRentalDto addRental(@CurrentUser AuthPrincipal principal,
                                     @Valid @RequestBody TenantRentalCreateRequest body) {
        return rentalService.addRental(principal.userId(), body);
    }

    @PatchMapping(Routes.Rentals.BY_ID)
    public TenantRentalDto updateRental(@CurrentUser AuthPrincipal principal,
                                        @PathVariable("rentalId") String rentalId,
                                        @Valid @RequestBody TenantRentalUpdateRequest body) {
        return rentalService.updateRental(principal.userId(), parseUuid(rentalId), body);
    }

    @DeleteMapping(Routes.Rentals.BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteRental(@CurrentUser AuthPrincipal principal,
                             @PathVariable("rentalId") String rentalId) {
        rentalService.deleteRental(principal.userId(), parseUuid(rentalId));
    }

    private static UUID parseUuid(String token) {
        return Ids.parseUuid(token).orElseThrow(() -> NotFoundException.of("Rental"));
    }
}

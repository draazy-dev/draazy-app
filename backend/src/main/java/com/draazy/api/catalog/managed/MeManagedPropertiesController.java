package com.draazy.api.catalog.managed;

import com.draazy.api.catalog.listing.ListingCreate;
import com.draazy.api.catalog.listing.ListingWriteResult;
import com.draazy.api.catalog.property.PropertyMapper;
import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeManagedPropertiesController {
    private final ManagedPropertyService service;
    private final PropertyMapper propertyMapper;
    private final TrackedRentService trackedRent;

    public MeManagedPropertiesController(ManagedPropertyService service, PropertyMapper propertyMapper,
            TrackedRentService trackedRent) {
        this.service = service;
        this.propertyMapper = propertyMapper;
        this.trackedRent = trackedRent;
    }

    @GetMapping(Routes.MeManagedProperties.BASE)
    public List<ManagedPropertyDto> mine(@CurrentUser AuthPrincipal principal) {
        return service.list(principal.userId());
    }

    @PostMapping(Routes.MeManagedProperties.BASE)
    @ResponseStatus(HttpStatus.CREATED)
    public ManagedPropertyDto register(@CurrentUser AuthPrincipal principal,
            @Valid @RequestBody ManagedPropertyCreateRequest body) {
        return service.register(principal.userId(), body);
    }

    @GetMapping(Routes.MeManagedProperties.BY_ID)
    public ManagedPropertyDto get(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return service.get(principal.userId(), id);
    }

    @PatchMapping(Routes.MeManagedProperties.BY_ID)
    public ManagedPropertyDto update(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @Valid @RequestBody ManagedPropertyUpdateRequest body) {
        return service.update(principal.userId(), id, body);
    }

    @DeleteMapping(Routes.MeManagedProperties.BY_ID)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        service.delete(principal.userId(), id);
    }

    @DeleteMapping(Routes.MeManagedProperties.RENT_TRACKING)
    public ManagedPropertyDto stopRentTracking(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return service.stopRentTracking(principal.userId(), id);
    }

    @DeleteMapping(Routes.MeManagedProperties.RENT_CLAIM)
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void rejectRentClaim(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @PathVariable String month) {
        trackedRent.rejectClaim(principal.userId(), id, month);
    }

    @PostMapping(Routes.MeManagedProperties.LISTING)
    @ResponseStatus(HttpStatus.CREATED)
    public ListingWriteResult publishWith(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @Valid @RequestBody ListingCreate body) {
        return propertyMapper.toWriteResult(service.publishWith(principal.userId(), id, body));
    }

    @GetMapping(Routes.MeManagedProperties.RENT_RECEIPTS)
    public List<ManagedRentReceiptDto> rentReceipts(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @RequestParam(required = false) Integer months) {
        return service.listRentReceipts(principal.userId(), id, months);
    }

    @PostMapping(Routes.MeManagedProperties.RENT_RECEIPTS)
    @ResponseStatus(HttpStatus.CREATED)
    public ManagedRentReceiptDto recordRentReceipt(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody ManagedRentReceiptCreateRequest body) {
        return service.recordRentReceipt(principal.userId(), id, body.rentMonth());
    }
}

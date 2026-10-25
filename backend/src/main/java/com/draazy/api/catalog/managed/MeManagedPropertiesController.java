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

/** Every route is scoped to the JWT caller; another owner's record is a 404, never a 403, so its existence is not
 * confirmed. Authentication plus owner-scoping is the whole gate. */
@RestController
public class MeManagedPropertiesController {

    private final ManagedPropertyService service;
    private final PropertyMapper propertyMapper;

    public MeManagedPropertiesController(ManagedPropertyService service, PropertyMapper propertyMapper) {
        this.service = service;
        this.propertyMapper = propertyMapper;
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

    /** {@code DELETE /me/managed-properties/{id}/rent-tracking}: stop tracking and clear the tenant. Returns the
     * updated record so the caller needn't re-read it; receipts already issued are kept. */
    @DeleteMapping(Routes.MeManagedProperties.RENT_TRACKING)
    public ManagedPropertyDto stopRentTracking(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return service.stopRentTracking(principal.userId(), id);
    }

    /** Idempotent: a record already published is returned unchanged. */
    @PostMapping(Routes.MeManagedProperties.PUBLISH)
    public ManagedPropertyDto publish(@CurrentUser AuthPrincipal principal, @PathVariable String id) {
        return service.publish(principal.userId(), id);
    }

    /** The full listing wizard's payload, for a home whose facts were captured elsewhere. A repeat is a 409. */
    @PostMapping(Routes.MeManagedProperties.LISTING)
    @ResponseStatus(HttpStatus.CREATED)
    public ListingWriteResult publishWith(@CurrentUser AuthPrincipal principal, @PathVariable String id,
            @Valid @RequestBody ListingCreate body) {
        return propertyMapper.toWriteResult(service.publishWith(principal.userId(), id, body));
    }

    /** {@code months} is a page size, so it is clamped rather than rejected. */
    @GetMapping(Routes.MeManagedProperties.RENT_RECEIPTS)
    public List<ManagedRentReceiptDto> rentReceipts(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @RequestParam(required = false) Integer months) {
        return service.listRentReceipts(principal.userId(), id, months);
    }

    /** Only the month is taken from the body; every figure is snapshotted server-side. A repeat month is a 409. */
    @PostMapping(Routes.MeManagedProperties.RENT_RECEIPTS)
    @ResponseStatus(HttpStatus.CREATED)
    public ManagedRentReceiptDto recordRentReceipt(@CurrentUser AuthPrincipal principal,
            @PathVariable String id, @Valid @RequestBody ManagedRentReceiptCreateRequest body) {
        return service.recordRentReceipt(principal.userId(), id, body.rentMonth());
    }
}

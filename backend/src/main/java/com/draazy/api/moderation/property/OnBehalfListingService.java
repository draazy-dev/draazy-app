package com.draazy.api.moderation.property;

import com.draazy.api.catalog.listing.ListingQuota;
import com.draazy.api.catalog.listing.ListingService;
import com.draazy.api.catalog.property.DealIntent;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.user.UserService;
import com.draazy.api.security.AuthPrincipal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OnBehalfListingService {
    private final ListingService listings;
    private final ListingQuota quota;
    private final UserRepository users;
    private final UserService userService;
    private final PropertyRepository properties;
    private final AuditService audit;

    public OnBehalfListingService(ListingService listings, ListingQuota quota,
            UserRepository users, UserService userService, PropertyRepository properties,
            AuditService audit) {
        this.listings = listings;
        this.quota = quota;
        this.users = users;
        this.userService = userService;
        this.properties = properties;
        this.audit = audit;
    }

    @Transactional
    public Property create(AuthPrincipal caller, OnBehalfListingRequest body) {
        if (DealIntent.RENT.equals(body.listing().deal()) && body.listing().deposit() == null) {
            throw new ValidationException("listing.deposit is required for a rent listing.");
        }
        User owner = users.findByMobile(body.ownerMobile()).orElse(null);
        boolean provisioned = owner == null;
        if (provisioned) {
            owner = userService.provisionUnverified(body.ownerMobile(), body.ownerName());
            audit.record(caller, "user.provision_on_behalf", "user", owner.getId().toString(),
                    "mobile", body.ownerMobile());
        }

        Property created = listings.createOnBehalf(owner.getId(), body.listing(), owner.getId(), caller.userId());

        created.markPostedOnBehalf(caller.userId().toString());

        audit.record(caller, "property.create_on_behalf", "property", created.getId().toString(),
                "ownerId", owner.getId().toString(),
                "ownerMobile", body.ownerMobile(),
                "ownerProvisioned", String.valueOf(provisioned));
        return created;
    }

    @Transactional(readOnly = true)
    public OwnerListingStanding standingFor(String mobile) {
        String digits = mobile == null ? "" : mobile.replaceAll("\\D", "");
        if (digits.length() != 10) {
            throw new BadRequestException("mobile must be a 10-digit number");
        }
        return users.findByMobile(digits)
                .map(owner -> {
                    ListingQuota.ListingStanding standing = quota.standingFor(owner.getId());
                    return new OwnerListingStanding(digits, true, standing.allowance(),
                            standing.held(), standing.overAllowance(),
                            properties.countByOwnerIdAndStatusAndArchivedFalse(owner.getId(),
                                    PropertyStatus.PENDING));
                })
                .orElseGet(() -> new OwnerListingStanding(digits, false, 0, 0, false, 0));
    }

    public record OwnerListingStanding(String mobile, boolean known, int allowance, long held,
            boolean overAllowance, long pending) {
    }
}

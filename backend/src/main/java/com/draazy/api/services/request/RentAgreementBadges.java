package com.draazy.api.services.request;

import com.draazy.api.catalog.property.AgreementOwnership;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.OwnerBadgeSink;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;

// Staff verify the licensor's ID before the final agreement can be uploaded, so a registered
// agreement earns the owner the Verified badge and their linked listing the Verified property badge.
@Component
class RentAgreementBadges {
    private final UserRepository users;
    private final OwnerBadgeSink ownerBadges;
    private final PropertyRepository properties;
    private final AgreementOwnership ownership;
    private final AuditService audit;
    private final Notifier notifier;

    RentAgreementBadges(UserRepository users, OwnerBadgeSink ownerBadges, PropertyRepository properties,
            AgreementOwnership ownership, AuditService audit, Notifier notifier) {
        this.users = users;
        this.ownerBadges = ownerBadges;
        this.properties = properties;
        this.ownership = ownership;
        this.audit = audit;
        this.notifier = notifier;
    }

    // A verified profile's name is locked, so the badge binds the licensor name staff checked against their ID.
    void verifyOwner(UUID ownerId, UUID requestId, String licensorName) {
        User owner = users.findById(ownerId).filter(u -> !u.isArchived() && !u.isVerified()).orElse(null);
        if (owner == null) {
            return;
        }
        if (owner.getName() == null || owner.getName().isBlank()) {
            if (licensorName == null || licensorName.isBlank()) {
                return;
            }
            owner.setName(licensorName.strip());
        }
        owner.setVerified(true);
        users.saveAndFlush(owner);
        ownerBadges.markOwnerVerified(ownerId);
        audit.record("system", "admin", "user.badge.agreement", "user", ownerId.toString(),
                Map.of("request", requestId.toString()));
        notifier.notify(ownerId, "identity.approved", "You're a Verified owner",
                "Your registered rent agreement confirmed your identity, so your profile now carries the Verified badge.",
                "/dashboard");
    }

    void verifyListing(UUID listingId, UUID ownerId, UUID requestId) {
        properties.findOwnedForUpdate(listingId, ownerId).ifPresent(p -> {
            if (ownership.verify(p, requestId)) {
                properties.saveAndFlush(p);
            }
        });
    }
}

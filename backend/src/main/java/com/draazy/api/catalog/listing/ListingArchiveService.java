package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyLifecycle;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.ReferralTriggers;
import com.draazy.api.common.web.Ids;
import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.Roles;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Archive/restore use an unscoped lookup, so their owner-or-staff authorization lives here. */
@Service
public class ListingArchiveService {

    public static final String DUPLICATE_REASON = "Merged duplicate";

    private final PropertyRepository properties;
    private final ListingDuplicateProbe duplicates;
    private final PropertyLifecycle lifecycle;
    private final AccountPermissions permissions;
    private final ReferralTriggers referralTriggers;
    private final AuditService audit;
    private final Notifier notifier;

    public ListingArchiveService(PropertyRepository properties, ListingDuplicateProbe duplicates,
            PropertyLifecycle lifecycle, AccountPermissions permissions, ReferralTriggers referralTriggers,
            AuditService audit, Notifier notifier) {
        this.properties = properties;
        this.duplicates = duplicates;
        this.lifecycle = lifecycle;
        this.permissions = permissions;
        this.referralTriggers = referralTriggers;
        this.audit = audit;
        this.notifier = notifier;
    }

    /** Unauthorized callers get {@code 404}, not {@code 403}, to avoid listing enumeration. */
    @Transactional
    public Property archive(AuthPrincipal principal, String idOrSlug, String reason) {
        Property p = resolvePermitted(principal, idOrSlug);
        String from = p.getStatus();
        p.archive(reason);
        audit.record(principal, "property.archive", "property", p.getId().toString(),
                "from", from, "to", "archived", "reason", reason, "owner", p.getOwner().getId().toString());
        properties.endListingPasses(p.getId());
        if (!p.getOwner().getId().equals(principal.userId())) {
            referralTriggers.listingTakenDown(p.getId());
        }
        lifecycle.announceArchived(p);
        return p;
    }

    /** The owner-facing route: staff taking a listing down tell its owner why. */
    @Transactional
    public Property archiveAndNotify(AuthPrincipal principal, String idOrSlug, String reason) {
        Property p = archive(principal, idOrSlug, reason);
        if (!p.getOwner().getId().equals(principal.userId())) {
            String why = reason == null || reason.isBlank() ? "" : " Reason: " + reason.trim();
            notifier.notify(p.getOwner().getId(), "listing.archived", "Your listing was archived",
                    PropertyLifecycle.label(p) + " was archived by our team." + why, "/dashboard");
        }
        return p;
    }

    /** Restored listings reenter moderation and duplicate probing before going live again. */
    @Transactional
    public Property restore(AuthPrincipal principal, String idOrSlug) {
        Property p = resolvePermitted(principal, idOrSlug);
        p.restore();
        if (!PropertyStatus.REJECTED.equals(p.getStatus())) {
            lifecycle.reenterPending(principal, p);
        }
        audit.record(principal, "property.restore", "property", p.getId().toString(),
                "from", "archived", "to", p.getStatus(), "owner", p.getOwner().getId().toString());
        properties.flush();
        duplicates.flag(p);
        return p;
    }

    /** Lookup is deliberately unscoped; this authorization gate protects every listing. */
    private Property resolvePermitted(AuthPrincipal principal, String idOrSlug) {
        UUID id = Ids.parseUuid(idOrSlug).orElse(null);
        Property p = (id != null ? properties.findById(id) : properties.findBySlug(idOrSlug))
                .orElseThrow(() -> NotFoundException.of("Listing"));
        boolean isOwner = p.getOwner().getId().equals(principal.userId());
        boolean isModerator = Roles.isBackOffice(principal.role());
        if (!isOwner && !isModerator) {
            throw NotFoundException.of("Listing");
        }
        if (!isOwner && !permissions.granted(principal, BackOfficePermissions.PROPERTIES_MODERATE)) {
            throw new ForbiddenException("Your account cannot moderate listings.");
        }
        return p;
    }
}

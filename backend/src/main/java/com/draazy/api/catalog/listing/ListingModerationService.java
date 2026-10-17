package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.locality.LocalityRepository;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyLifecycle;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.settings.PhotoLimit;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ListingModerationService {

    private final ListingService listings;
    private final ListingEditRules editRules;
    private final LocalityRepository localities;
    private final ListingDuplicateProbe duplicates;
    private final ListingPhotoSources photoSources;
    private final PhotoLimit photoLimit;
    private final AuditService audit;
    private final Notifier notifier;

    public ListingModerationService(ListingService listings, ListingEditRules editRules,
            LocalityRepository localities, ListingDuplicateProbe duplicates, ListingPhotoSources photoSources, PhotoLimit photoLimit,
            AuditService audit, Notifier notifier) {
        this.listings = listings;
        this.editRules = editRules;
        this.localities = localities;
        this.duplicates = duplicates;
        this.photoSources = photoSources;
        this.photoLimit = photoLimit;
        this.audit = audit;
        this.notifier = notifier;
    }

    /** Staff edit of someone else's listing; non-effects: docs/flows/consumer/list-property-wizard.md 9.3. */
    @Transactional
    public Property updateAsModerator(AuthPrincipal principal, String idOrSlug, ListingUpdate in) {
        Property p = listings.resolveForWrite(idOrSlug).orElseThrow(() -> NotFoundException.of("Listing"));
        if (p.isMadeBy(principal.userId())) {
            throw new ForbiddenException("You own or posted this listing, so another reviewer must correct it");
        }
        photoLimit.require("A listing", in.images());
        photoSources.requireUploaded(in.images(), p.getImages(), List.of(p.getOwner().getId(), principal.userId()));
        String slugBefore = p.getLocalitySlug();
        var before = ListingChanges.snapshot(p);
        editRules.apply(p, in);
        if (in.lat() == null && in.lng() == null && !Objects.equals(slugBefore, p.getLocalitySlug())) {
            movePinToLocality(p);
        }

        // The key is recomputed so the listing stays findable by a *later* probe, but no probe runs
        // on this edit: a human is already looking, and is the one making the change.
        duplicates.reindex(p);
        var changes = ListingChanges.diff(before, ListingChanges.snapshot(p));
        audit.record(principal, "property.adminUpdate", "property", p.getId().toString(),
                "owner", p.getOwner().getId().toString(), "changes", changes);
        if (!changes.isEmpty()) {
            notifier.notify(p.getOwner().getId(), "listing.edited_by_staff", "Your listing was updated by our team",
                    PropertyLifecycle.label(p) + " was corrected by a reviewer: " + String.join(", ", changes.keySet()) + ".",
                    "/dashboard");
        }
        return p;
    }

    // A moved locality with no pin of its own would otherwise leave the map pointing at the old one.
    private void movePinToLocality(Property p) {
        localities.findById(p.getLocalitySlug())
                .filter(l -> l.getLat() != null && l.getLng() != null)
                .ifPresent(l -> {
                    p.setLat(l.getLat());
                    p.setLng(l.getLng());
                });
    }
}

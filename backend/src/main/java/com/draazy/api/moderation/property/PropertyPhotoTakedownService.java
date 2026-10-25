package com.draazy.api.moderation.property;

import com.draazy.api.catalog.listing.ListingDuplicateProbe;
import com.draazy.api.catalog.photo.ListingPhotoFiles;
import com.draazy.api.catalog.property.PhotoHash;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyLifecycle;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.web.Ids;
import com.draazy.api.moderation.verification.VerificationCases;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import java.util.Map;
import org.hibernate.Hibernate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Staff pull one photo from a listing, short of pulling the whole listing. */
@Service
public class PropertyPhotoTakedownService {

    static final Map<String, String> REASONS = Map.of(
            "not_the_property", "it does not show this property",
            "people_visible", "it shows people",
            "contact_info", "it shows contact details",
            "other", "it does not meet our photo guidelines");

    private final PropertyRepository properties;
    private final PropertyLifecycle lifecycle;
    private final ListingDuplicateProbe duplicates;
    private final VerificationCases cases;
    private final AuditService audit;
    private final Notifier notifier;
    private final ListingPhotoFiles photoFiles;

    public PropertyPhotoTakedownService(PropertyRepository properties, PropertyLifecycle lifecycle,
            ListingDuplicateProbe duplicates, VerificationCases cases,
            AuditService audit, Notifier notifier, ListingPhotoFiles photoFiles) {
        this.properties = properties;
        this.lifecycle = lifecycle;
        this.duplicates = duplicates;
        this.cases = cases;
        this.audit = audit;
        this.notifier = notifier;
        this.photoFiles = photoFiles;
    }

    @Transactional
    public Property takedown(AuthPrincipal actor, String id, String photo, String reason) {
        String code = reason == null ? "" : reason.trim();
        if (!REASONS.containsKey(code)) {
            throw new BadRequestException("invalid_photo_reason", "reason must be one of "
                    + String.join(", ", REASONS.keySet().stream().sorted().toList()));
        }
        Property property = Ids.parseUuid(id).flatMap(properties::findForVerificationDecision)
                .orElseThrow(() -> NotFoundException.of("Property"));
        // The controller maps the owner after this transaction closes.
        Hibernate.initialize(property.getOwner());
        lifecycle.requireChecker(actor, property);
        lifecycle.requireActive(property);
        List<String> gallery = property.getImages() == null ? List.of() : property.getImages();
        if (photo == null || !gallery.contains(photo)) {
            throw new NotFoundException("That photo is not on this listing");
        }

        List<String> remaining = gallery.stream().filter(url -> !url.equals(photo)).toList();
        property.setImages(remaining);
        if (photo.equals(property.getCoverImage())) {
            property.setCoverImage(null);
        }
        if (photo.equals(property.getFloorPlan())) {
            property.setFloorPlan(null);
        }
        duplicates.reindexPhotos(property, PhotoHash.fromGallery(remaining));

        boolean sentBack = remaining.isEmpty() && property.getCoverImage() == null;
        String ownerNote = ownerNote(code, sentBack);
        if (sentBack) {
            sendBack(actor, property, ownerNote);
        }
        audit.record(actor, "listing.photo.takedown", "property", id, "photo", photo, "reason", code,
                "remaining", remaining.size(), "sentBack", sentBack,
                "owner", String.valueOf(property.getOwner().getId()));
        notifier.notify(property.getOwner().getId(), "listing.photo_removed",
                "A photo was removed from your listing", ownerNote,
                "/list-property?edit=" + property.getId() + "&step=photos");
        photoFiles.deleteUnusedAfterCommit(property.getId(), List.of(photo));
        return property;
    }

    // Approved listings drop back to the queue; one already waiting just gets the question.
    private void sendBack(AuthPrincipal actor, Property property, String ownerNote) {
        if (PropertyStatus.APPROVED.equals(property.getStatus())) {
            lifecycle.reenterPending(actor, property);
        }
        property.requestInfo();
        cases.requestInfo(property.getId(), property.getDeal(), actor.userId(), ownerNote);
    }

    private static String ownerNote(String code, boolean sentBack) {
        String note = "A moderator removed a photo from your listing because " + REASONS.get(code) + ".";
        return sentBack
                ? note + " It had no other photos, so it needs changes: add a photo to send it back for review."
                : note + " You can add another photo any time.";
    }
}

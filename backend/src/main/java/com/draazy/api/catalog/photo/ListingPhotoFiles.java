package com.draazy.api.catalog.photo;

import com.draazy.api.catalog.property.PropertyRepository;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Deletes the stored files a listing stopped showing, unless something else still shows them. */
@Component
public class ListingPhotoFiles {

    private static final Logger log = LoggerFactory.getLogger(ListingPhotoFiles.class);

    private final PhotoService photos;
    private final PropertyRepository properties;

    ListingPhotoFiles(PhotoService photos, PropertyRepository properties) {
        this.photos = photos;
        this.properties = properties;
    }

    /** A failed delete is logged and leaves the file behind. */
    public void deleteUnusedAfterCommit(UUID propertyId, Collection<String> urls) {
        if (urls.isEmpty()) {
            return;
        }
        properties.flush();
        List<String> unused = urls.stream().filter(url -> !properties.photoUsedElsewhere(propertyId, url)).toList();
        if (unused.isEmpty()) {
            return;
        }
        // After commit, so a rollback never leaves a listing pointing at a deleted file.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (String url : unused) {
                    try {
                        photos.delete(url);
                    } catch (RuntimeException e) {
                        log.warn("Photo {} is no longer shown but its file was not deleted: {}", url, e.toString());
                    }
                }
            }
        });
    }
}

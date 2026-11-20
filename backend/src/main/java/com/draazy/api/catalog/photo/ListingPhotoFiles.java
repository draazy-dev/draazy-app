package com.draazy.api.catalog.photo;

import com.draazy.api.catalog.property.PropertyRepository;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
public class ListingPhotoFiles {
    private final PhotoDeleteQueue deletes;
    private final PropertyRepository properties;

    ListingPhotoFiles(PhotoDeleteQueue deletes, PropertyRepository properties) {
        this.deletes = deletes;
        this.properties = properties;
    }

    public void deleteUnusedAfterCommit(UUID propertyId, Collection<String> urls) {
        if (urls.isEmpty()) {
            return;
        }
        properties.flush();
        List<String> unused = urls.stream().filter(url -> !properties.photoUsedElsewhere(propertyId, url)).toList();
        if (unused.isEmpty()) {
            return;
        }
        // Delete after commit so a rollback never leaves a listing pointing at a deleted file.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                unused.forEach(deletes::deleteOrQueue);
            }
        });
    }
}

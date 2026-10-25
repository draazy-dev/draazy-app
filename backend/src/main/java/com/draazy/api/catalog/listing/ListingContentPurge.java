package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.photo.ListingPhotoFiles;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.audit.AuditService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Once an owner-deleted listing's undo window ends, clears what it showed and deletes its photos from storage. */
@Service
public class ListingContentPurge {

    public static final Duration UNDO_WINDOW = Duration.ofDays(30);

    private static final int BATCH = 200;

    private final PropertyRepository properties;
    private final ListingPhotoFiles photoFiles;
    private final AuditService audit;

    ListingContentPurge(PropertyRepository properties, ListingPhotoFiles photoFiles, AuditService audit) {
        this.properties = properties;
        this.photoFiles = photoFiles;
        this.audit = audit;
    }

    /** Purges one page of due listings; returns how many. */
    @Transactional
    public int purgeDue(Instant now) {
        List<Property> due = properties.findContentPurgeDue(now, Limit.of(BATCH));
        for (Property p : due) {
            Set<String> files = p.purgeContent(now);
            photoFiles.deleteUnusedAfterCommit(p.getId(), files);
            audit.record("system", "admin", "property.contentPurged", "property", p.getId().toString(),
                    Map.of("files", files.size()));
        }
        return due.size();
    }
}

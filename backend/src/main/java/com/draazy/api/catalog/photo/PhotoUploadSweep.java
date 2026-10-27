package com.draazy.api.catalog.photo;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.provider.FileStorage;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;

/** Deletes uploads that nothing shows once the wizard's saved draft has had a week to use them. */
@Service
public class PhotoUploadSweep {

    static final Duration GRACE = Duration.ofDays(7);

    private static final Logger log = LoggerFactory.getLogger(PhotoUploadSweep.class);
    private static final int BATCH = 200;

    private final PhotoUploadRepository uploads;
    private final PropertyRepository properties;
    private final PhotoService photos;
    private final FileStorage storage;

    PhotoUploadSweep(PhotoUploadRepository uploads, PropertyRepository properties, PhotoService photos,
            FileStorage storage) {
        this.uploads = uploads;
        this.properties = properties;
        this.photos = photos;
        this.storage = storage;
    }

    /** Settles one page of uploads past the grace period; returns how many. A failed delete keeps its row for the
     * next run, since storage deletes are idempotent and only fail transiently. */
    public int sweep(Instant now) {
        List<PhotoUpload> due = uploads.findByCreatedAtBeforeOrderByCreatedAt(now.minus(GRACE), Limit.of(BATCH));
        String prefix = storage.publicUrlPrefix();
        List<PhotoUpload> settled = new ArrayList<>();
        for (PhotoUpload upload : due) {
            String url = prefix + upload.getStorageKey();
            try {
                if (!properties.photoShownAnywhere(url)) {
                    photos.delete(url);
                }
                settled.add(upload);
            } catch (RuntimeException e) {
                log.warn("Abandoned photo {} was not deleted: {}", url, e.toString());
            }
        }
        uploads.deleteAllInBatch(settled);
        return settled.size();
    }
}

package com.draazy.api.catalog.photo;

import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.persistence.RateLimitLock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Caps what one account can put in the public bucket, and records each upload for {@link PhotoUploadSweep}. */
@Component
public class PhotoUploadQuota {

    static final Duration WINDOW = Duration.ofHours(24);

    private final int maxPerWindow;
    private final PhotoUploadRepository uploads;
    private final RateLimitLock locks;

    PhotoUploadQuota(PhotoUploadRepository uploads, RateLimitLock locks,
            @Value("${draazy.photos.max-uploads-per-day:100}") int maxPerWindow) {
        this.uploads = uploads;
        this.locks = locks;
        this.maxPerWindow = maxPerWindow;
    }

    int maxPerWindow() {
        return maxPerWindow;
    }

    /** Recorded before the bytes are stored, so a stored file is never one the sweep cannot see. */
    @Transactional
    public void reserve(UUID uploaderId, String storageKey) {
        locks.holdUntilCommit(RateLimitLock.Limit.PHOTO_UPLOAD, uploaderId.toString());
        Instant now = Instant.now();
        if (uploads.countByUploaderIdAndCreatedAtAfter(uploaderId, now.minus(WINDOW)) >= maxPerWindow) {
            throw new RateLimitedException("You can upload up to " + maxPerWindow
                    + " photos a day. Please try again tomorrow.", (int) WINDOW.toSeconds());
        }
        uploads.saveAndFlush(new PhotoUpload(storageKey, uploaderId, now));
    }
}

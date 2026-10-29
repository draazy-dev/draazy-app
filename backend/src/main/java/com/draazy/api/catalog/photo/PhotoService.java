package com.draazy.api.catalog.photo;

import com.draazy.api.catalog.property.PhotoHash;
import com.draazy.api.common.error.PayloadTooLargeException;
import com.draazy.api.common.validation.MediaSignatures;
import com.draazy.api.provider.FileStorage;
import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class PhotoService {
    private static final Logger log = LoggerFactory.getLogger(PhotoService.class);

    private final FileStorage storage;
    private final PhotoKeys keys;
    private final PhotoUploadQuota quota;

    public PhotoService(FileStorage storage, PhotoKeys keys, PhotoUploadQuota quota) {
        this.storage = storage;
        this.keys = keys;
        this.quota = quota;
    }

    public PhotoDto upload(UUID ownerId, MultipartFile file) {
        if (file.getSize() >= PhotoUploads.MAX_BYTES) {
            throw new PayloadTooLargeException("Photos must be smaller than 1,000,000 bytes (1 MB)");
        }
        byte[] bytes = readBytes(file);
        String type = PhotoUploads.validate(file.getContentType(), file.getSize(), bytes);
        bytes = ImageMetadataStripper.strip(type, bytes);
        PhotoUploads.validate(type, bytes.length, bytes);

        String key = keys.newKey(ownerId);
        Long hash = PhotoHash.compute(bytes);
        if (hash != null) {
            key += "-" + PhotoHash.toHex(hash);
        }
        quota.reserve(ownerId, key);
        storeVariants(key, bytes);
        return new PhotoDto(storage.storePublic(key, bytes, type));
    }

    public void delete(String url) {
        String prefix = storage.publicUrlPrefix();
        if (url == null || !url.startsWith(prefix)) {
            return;
        }
        String key = url.substring(prefix.length());
        if (!keys.isPhotoKey(key)) {
            return;
        }
        storage.deletePublic(key);
        for (int width : PhotoVariants.WIDTHS) {
            storage.deletePublic(PhotoVariants.key(key, width));
        }
    }

    private void storeVariants(String key, byte[] bytes) {
        Map<Integer, byte[]> variants;
        try {
            variants = PhotoVariants.of(bytes);
        } catch (IOException | RuntimeException e) {
            log.warn("No card-size copies for {}: {}", key, e.toString());
            return;
        }
        variants.forEach((width, jpeg) ->
                storage.storePublic(PhotoVariants.key(key, width), jpeg, MediaSignatures.JPEG));
    }

    private static byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException("cannot read uploaded photo", e);
        }
    }
}

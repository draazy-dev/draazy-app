package com.draazy.api.catalog.photo;

import com.draazy.api.provider.FileStorage;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.stereotype.Service;

@Service
public class PhotoVariantBackfill {
    static final int BATCH = 20;

    private final FileStorage storage;
    private final PhotoKeys keys;
    private final PhotoService photos;
    // Originals that will never decode would otherwise be re-read every run and hog the batch.
    private final Set<String> unconvertible = ConcurrentHashMap.newKeySet();

    PhotoVariantBackfill(FileStorage storage, PhotoKeys keys, PhotoService photos) {
        this.storage = storage;
        this.keys = keys;
        this.photos = photos;
    }

    public long run() {
        Set<String> stored;
        try (Stream<String> listed = storage.listPublic("photos/")) {
            stored = listed.collect(Collectors.toSet());
        }
        List<String> missing = new ArrayList<>(stored.stream()
                .filter(keys::isPhotoKey)
                .filter(key -> !unconvertible.contains(key))
                .filter(key -> !stored.containsAll(webpKeys(key)))
                .toList());
        Collections.shuffle(missing);
        long converted = 0;
        for (String key : missing.subList(0, Math.min(BATCH, missing.size()))) {
            byte[] original = storage.readPublic(key).orElse(null);
            if (original != null && photos.storeVariants(key, original)) {
                converted++;
            } else {
                unconvertible.add(key);
            }
        }
        return converted;
    }

    private static List<String> webpKeys(String key) {
        return Arrays.stream(PhotoVariants.WIDTHS).mapToObj(width -> PhotoVariants.key(key, width)).toList();
    }
}

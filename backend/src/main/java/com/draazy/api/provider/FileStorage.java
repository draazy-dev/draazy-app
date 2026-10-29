package com.draazy.api.provider;

import com.draazy.api.provider.storage.DevObjectStore;
import com.draazy.api.security.LocalOnly;
import com.draazy.api.security.LocalProfileGuard;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

public interface FileStorage {
    void store(String key, byte[] content, String contentType);

    String signedDownloadUrl(String key);

    void delete(String key);

    String storePublic(String key, byte[] content, String contentType);

    default void deletePublic(String key) {
        throw new UnsupportedOperationException("This storage cannot delete public objects");
    }
    String publicUrlPrefix();
    }

@Component
@LocalOnly
@ConditionalOnProperty(prefix = "draazy.providers.storage", name = "enabled",
        havingValue = "false", matchIfMissing = true)
class MockFileStorage implements FileStorage {
    private final DevObjectStore objects;

    MockFileStorage(DevObjectStore objects) {
        this.objects = objects;
    }

    @Override
    public void store(String key, byte[] content, String contentType) {
        objects.store(key, content, contentType);
    }

    @Override
    public String signedDownloadUrl(String key) {
        return objects.downloadUrl(key);
    }

    @Override
    public void delete(String key) {
        objects.delete(key);
    }

    @Override
    public String storePublic(String key, byte[] content, String contentType) {
        store(DevObjectStore.PUBLIC_PREFIX + key, content, contentType);
        return objects.publicUrl(DevObjectStore.PUBLIC_PREFIX + key);
    }

    @Override
    public void deletePublic(String key) {
        objects.delete(DevObjectStore.PUBLIC_PREFIX + key);
    }

    @Override
    public String publicUrlPrefix() {
        return objects.publicUrl(DevObjectStore.PUBLIC_PREFIX);
    }
    }

@Component
@Profile(LocalProfileGuard.NOT_LOCAL)
@ConditionalOnProperty(prefix = "draazy.providers.storage", name = "enabled",
        havingValue = "false", matchIfMissing = true)
class ObjectStoreFileStorage implements FileStorage {
    @Override
    public void store(String key, byte[] content, String contentType) {
        throw new UnsupportedOperationException("Object storage not configured for prod yet");
    }

    @Override
    public String signedDownloadUrl(String key) {
        throw new UnsupportedOperationException("Object storage not configured for prod yet");
    }

    @Override
    public void delete(String key) {
        throw new UnsupportedOperationException("Object storage not configured for prod yet");
    }

    @Override
    public String storePublic(String key, byte[] content, String contentType) {
        throw new UnsupportedOperationException("Object storage not configured for prod yet");
    }

    @Override
    public String publicUrlPrefix() {
        throw new UnsupportedOperationException("Object storage not configured for prod yet");
    }
    }

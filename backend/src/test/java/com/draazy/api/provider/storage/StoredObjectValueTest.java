package com.draazy.api.provider.storage;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StoredObjectValueTest {
    @Test
    void storedObjectsWithTheSameContentAreEqual() {
        DevObjectStore.Stored first = new DevObjectStore.Stored(new byte[] {1, 2}, "image/png");
        DevObjectStore.Stored second = new DevObjectStore.Stored(new byte[] {1, 2}, "image/png");

        assertThat(first).isEqualTo(second).hasSameHashCodeAs(second);
    }

    @Test
    void differentContentOrTypeAreNotEqual() {
        DevObjectStore.Stored stored = new DevObjectStore.Stored(new byte[] {1, 2}, "image/png");

        assertThat(stored).isNotEqualTo(new DevObjectStore.Stored(new byte[] {1, 3}, "image/png"));
        assertThat(stored).isNotEqualTo(new DevObjectStore.Stored(new byte[] {1, 2}, "image/jpeg"));
    }

    @Test
    void textShowsTheSizeNotTheContent() {
        assertThat(new DevObjectStore.Stored(new byte[] {5, 6, 7}, "image/png").toString())
                .contains("3 bytes", "image/png")
                .doesNotContain("5, 6, 7");
    }
}

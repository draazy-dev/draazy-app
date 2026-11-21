package com.draazy.api.leads.conversation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class ProcessedPhotoValueTest {
    private static MessagePhotoUpload.Processed photo(byte... bytes) {
        return new MessagePhotoUpload.Processed(bytes, "image/jpeg", "a.jpg", "key");
    }

    @Test
    void photosWithTheSameBytesAndMetadataAreEqual() {
        assertThat(photo((byte) 1, (byte) 2)).isEqualTo(photo((byte) 1, (byte) 2))
                .hasSameHashCodeAs(photo((byte) 1, (byte) 2));
    }

    @Test
    void differentBytesOrMetadataAreNotEqual() {
        assertThat(photo((byte) 1)).isNotEqualTo(photo((byte) 2));
        assertThat(photo((byte) 1)).isNotEqualTo(
                new MessagePhotoUpload.Processed(new byte[] {1}, "image/png", "a.jpg", "key"));
    }

    @Test
    void textShowsTheSizeNotTheContent() {
        assertThat(photo((byte) 7, (byte) 8, (byte) 9).toString())
                .contains("bytes=3", "image/jpeg", "a.jpg", "key")
                .doesNotContain("7, 8, 9");
    }
}

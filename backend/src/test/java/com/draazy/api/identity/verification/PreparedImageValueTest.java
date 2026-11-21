package com.draazy.api.identity.verification;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PreparedImageValueTest {
    @Test
    void imagesWithTheSameBytesAreEqual() {
        PreparedImage first = new PreparedImage("front", new byte[] {1, 2}, "image/png");
        PreparedImage second = new PreparedImage("front", new byte[] {1, 2}, "image/png");

        assertThat(first).isEqualTo(second).hasSameHashCodeAs(second);
    }

    @Test
    void differentBytesKindOrTypeAreNotEqual() {
        PreparedImage image = new PreparedImage("front", new byte[] {1, 2}, "image/png");

        assertThat(image).isNotEqualTo(new PreparedImage("front", new byte[] {1, 3}, "image/png"));
        assertThat(image).isNotEqualTo(new PreparedImage("back", new byte[] {1, 2}, "image/png"));
        assertThat(image).isNotEqualTo(new PreparedImage("front", new byte[] {1, 2}, "image/jpeg"));
    }

    @Test
    void textNeverCarriesTheImageBytes() {
        assertThat(new PreparedImage("front", new byte[] {4, 5, 6}, "image/png").toString())
                .contains("kind=front", "bytes=3", "image/png")
                .doesNotContain("4, 5, 6");
    }
}

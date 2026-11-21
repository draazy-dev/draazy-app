package com.draazy.api.identity.verification;

import java.util.Arrays;
import java.util.Objects;

record PreparedImage(String kind, byte[] bytes, String contentType) {
    @Override
    public boolean equals(Object other) {
        return other instanceof PreparedImage that && Objects.equals(kind, that.kind)
                && Arrays.equals(bytes, that.bytes) && Objects.equals(contentType, that.contentType);
    }

    @Override
    public int hashCode() {
        return 31 * Objects.hash(kind, contentType) + Arrays.hashCode(bytes);
    }

    @Override
    public String toString() {
        return "PreparedImage[kind=" + kind + ", bytes=" + bytes.length + ", contentType=" + contentType + "]";
    }
}

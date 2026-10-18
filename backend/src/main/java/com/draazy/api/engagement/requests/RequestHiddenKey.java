package com.draazy.api.engagement.requests;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.util.UUID;

@Embeddable
public record RequestHiddenKey(
        @Column(name = "user_id") UUID userId,
        @Column(name = "kind") String kind,
        @Column(name = "ref_id") UUID refId) {
}

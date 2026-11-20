package com.draazy.api.engagement.flatmate;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import lombok.Getter;

@Embeddable
@Getter
class ModerationRecheck {
    @Column(name = "recheck_requested_at")
    private Instant requestedAt;

    @Column(name = "recheck_reason")
    private String reason;

    void settle(String modStatus, List<String> fields) {
        if (FlatmateVocabulary.isPublic(modStatus)) {
            request(fields);
        } else {
            clear();
        }
    }

    private void request(List<String> fields) {
        if (fields == null || fields.isEmpty()) {
            return;
        }
        LinkedHashSet<String> merged = new LinkedHashSet<>();
        if (reason != null && !reason.isBlank()) {
            Collections.addAll(merged, reason.split(",\\s*"));
        }
        merged.addAll(fields);
        this.reason = String.join(", ", merged);
        if (requestedAt == null) {
            this.requestedAt = Instant.now();
        }
    }

    void clear() {
        this.requestedAt = null;
        this.reason = null;
    }
}

package com.draazy.api.documents.vault;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
class RetiredPersonalDocumentPurge {
    private static final Logger log = LoggerFactory.getLogger(RetiredPersonalDocumentPurge.class);

    private final DocumentService documents;

    RetiredPersonalDocumentPurge(DocumentService documents) {
        this.documents = documents;
    }

    // A failed purge must not take the app down; the next boot retries it.
    @EventListener(ApplicationReadyEvent.class)
    void purge() {
        try {
            int removed = documents.purgeRetiredPersonal();
            if (removed > 0) {
                log.info("Purged {} retired identity/ownership personal documents", removed);
            }
        } catch (RuntimeException e) {
            log.error("Retired personal document purge failed; will retry on next boot", e);
        }
    }
}

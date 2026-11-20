package com.draazy.api.catalog.photo;

import com.draazy.api.catalog.property.PropertyRepository;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class PhotoDeleteQueue {
    private static final Logger log = LoggerFactory.getLogger(PhotoDeleteQueue.class);
    private static final int BATCH = 500;
    // Rows past this stay in the table with last_error as the dead-letter list.
    private static final int MAX_ATTEMPTS = 10;

    private final PhotoService photos;
    private final PhotoStorageDeleteRepository queued;
    private final PropertyRepository properties;
    private final TransactionTemplate transactions;

    PhotoDeleteQueue(PhotoService photos, PhotoStorageDeleteRepository queued, PropertyRepository properties,
            PlatformTransactionManager transactionManager) {
        this.photos = photos;
        this.queued = queued;
        this.properties = properties;
        this.transactions = new TransactionTemplate(transactionManager);
        // Runs from afterCommit, where the finished transaction cannot write any more.
        this.transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    void deleteOrQueue(String url) {
        try {
            photos.delete(url);
        } catch (RuntimeException e) {
            log.warn("Photo {} is no longer shown but its file was not deleted, queued for retry: {}", url, e.toString());
            transactions.executeWithoutResult(status -> queued.recordFailure(url, clipped(e)));
        }
    }

    public int retryQueued() {
        List<PhotoStorageDelete> due = queued.findAllByAttemptsLessThanOrderByAttemptsAscQueuedAtAsc(MAX_ATTEMPTS, Limit.of(BATCH));
        int settled = 0;
        for (PhotoStorageDelete row : due) {
            String url = row.getUrl();
            try {
                if (!properties.photoShownAnywhere(url)) {
                    photos.delete(url);
                }
                transactions.executeWithoutResult(status -> queued.deleteById(url));
                settled++;
            } catch (RuntimeException e) {
                if (row.getAttempts() + 1 >= MAX_ATTEMPTS) {
                    log.error("Queued photo delete {} gave up after {} attempts: {}", url, MAX_ATTEMPTS, e.toString());
                } else {
                    log.warn("Queued photo delete {} failed again: {}", url, e.toString());
                }
                transactions.executeWithoutResult(status -> queued.recordFailure(url, clipped(e)));
            }
        }
        return settled;
    }

    private static String clipped(RuntimeException e) {
        String message = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        return message.length() <= 500 ? message : message.substring(0, 500);
    }
}

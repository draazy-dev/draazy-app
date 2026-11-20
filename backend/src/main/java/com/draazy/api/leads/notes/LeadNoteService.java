package com.draazy.api.leads.notes;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.persistence.ConstraintViolations;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.LongAdder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class LeadNoteService {
    private static final Logger log = LoggerFactory.getLogger(LeadNoteService.class);

    private static final String UQ_OWNER_LEAD = "uq_lead_notes_owner_lead";

    static final int MAX_NOTES_PER_OWNER = 2_000;

    private static final long MAX_FOLLOW_UP_DAYS = 36_500;

    private final LeadNoteRepository notes;
    private final TransactionTemplate transactions;
    private final LongAdder racesRetried = new LongAdder();

    public LeadNoteService(LeadNoteRepository notes, PlatformTransactionManager transactionManager) {
        this.notes = notes;
        this.transactions = new TransactionTemplate(transactionManager);
    }

    long racesRetried() {
        return racesRetried.sum();
    }

    @Transactional(readOnly = true)
    public List<LeadNoteResponse> myNotes(UUID ownerId) {
        return notes.findByOwnerId(ownerId).stream().map(LeadNoteResponse::of).toList();
    }

    // Not @Transactional: each attempt needs its own TransactionTemplate, because a flush-time unique
    // violation marks the transaction rollback-only and a retry inside it would fail.
    public Optional<LeadNoteResponse> save(
            UUID ownerId, String leadKey, String note, Instant followUpAt) {
        if (followUpAt != null
                && (followUpAt.isAfter(Instant.now().plus(MAX_FOLLOW_UP_DAYS, ChronoUnit.DAYS))
                        || followUpAt.isBefore(
                                Instant.now().minus(MAX_FOLLOW_UP_DAYS, ChronoUnit.DAYS)))) {
            throw new BadRequestException(
                    "followUpAt is too far from today to be a date anyone meant to pick.");
        }
        try {
            return transactions.execute(tx -> upsert(ownerId, leadKey, note, followUpAt));
        } catch (DataIntegrityViolationException raced) {
            if (!ConstraintViolations.isOn(raced, UQ_OWNER_LEAD)
                    || TransactionSynchronizationManager.isActualTransactionActive()) {
                throw raced;
            }
            log.info("Concurrent lead-note writes raced on one key for owner {}; retrying as an"
                    + " update against the row the winner inserted", ownerId);
            racesRetried.increment();
            return transactions.execute(tx -> upsert(ownerId, leadKey, note, followUpAt));
        }
    }

    private Optional<LeadNoteResponse> upsert(
            UUID ownerId, String leadKey, String note, Instant followUpAt) {
        String trimmed = (note == null || note.isBlank()) ? null : note.trim();

        Optional<LeadNote> existing = notes.findByOwnerIdAndLeadKey(ownerId, leadKey);
        if (trimmed == null && followUpAt == null) {
            existing.ifPresent(notes::delete);
            return Optional.empty();
        }

        if (existing.isEmpty() && notes.countByOwnerId(ownerId) >= MAX_NOTES_PER_OWNER) {
            throw new BadRequestException(
                    "You have notes against " + MAX_NOTES_PER_OWNER + " leads already. Clear one you"
                            + " no longer need before adding another.");
        }

        LeadNote row = existing.orElseGet(() -> new LeadNote(ownerId, leadKey));
        row.replace(trimmed, followUpAt);
        return Optional.of(LeadNoteResponse.of(notes.saveAndFlush(row)));
    }
}

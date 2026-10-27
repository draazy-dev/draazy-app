package com.draazy.api.moderation.verification;

import com.draazy.api.catalog.listing.ListingArchiveService;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class NeedsInfoSweepService {

    private static final Logger log = LoggerFactory.getLogger(NeedsInfoSweepService.class);
    private static final Duration FIRST_REMINDER = Duration.ofDays(3);
    private static final Duration DAY_7 = Duration.ofDays(7);
    private static final Duration DAY_14 = Duration.ofDays(14);
    private static final int MAX_PER_TICK = 200;
    private static final String ARCHIVE_REASON = "needs_info_timeout";
    private static final UUID SYSTEM_USER_ID =
            UUID.nameUUIDFromBytes("draazy-system".getBytes(StandardCharsets.UTF_8));
    private static final AuthPrincipal SYSTEM_ACTOR =
            new AuthPrincipal(SYSTEM_USER_ID, Roles.Wire.ADMIN, "system", true, true);

    private final NeedsInfoReviewRepository reviews;
    private final ListingArchiveService archiveService;
    private final AuditService audit;
    private final Notifier notifier;
    private final Clock clock;
    private final TransactionTemplate tx;

    public NeedsInfoSweepService(NeedsInfoReviewRepository reviews, ListingArchiveService archiveService,
            AuditService audit, Notifier notifier, Clock clock, PlatformTransactionManager transactions) {
        this.tx = new TransactionTemplate(transactions);
        this.reviews = reviews;
        this.archiveService = archiveService;
        this.audit = audit;
        this.notifier = notifier;
        this.clock = clock;
    }

    // One transaction per row: a row that fails rolls back alone. The conditional mark* updates keep a
    // row that another instance already handled from being handled twice.
    public SweepResult sweep() {
        Instant now = Instant.now(clock);
        List<NeedsInfoReviewRepository.NeedsInfoCase> due = tx.execute(status -> reviews.findDue(
                now.minus(FIRST_REMINDER), now.minus(DAY_7), now.minus(DAY_14), MAX_PER_TICK));
        int reminded = 0;
        int archived = 0;
        for (NeedsInfoReviewRepository.NeedsInfoCase row : due) {
            try {
                Outcome outcome = tx.execute(status -> handle(row, now));
                reminded += outcome == Outcome.REMINDED ? 1 : 0;
                archived += outcome == Outcome.ARCHIVED ? 1 : 0;
            } catch (RuntimeException e) {
                log.error("Needs-info sweep failed for review {}; the other rows carry on", row.reviewId(), e);
            }
        }
        return new SweepResult(reminded, archived);
    }

    private enum Outcome { NONE, REMINDED, ARCHIVED }

    private Outcome handle(NeedsInfoReviewRepository.NeedsInfoCase row, Instant now) {
        if (!row.needsInfoAt().isAfter(now.minus(DAY_14))) {
            return archive(row, now) ? Outcome.ARCHIVED : Outcome.NONE;
        }
        if (!row.needsInfoAt().isAfter(now.minus(DAY_7))) {
            return remindDay7(row, now) ? Outcome.REMINDED : Outcome.NONE;
        }
        if (!row.needsInfoAt().isAfter(now.minus(FIRST_REMINDER))) {
            return remindFirst(row, now) ? Outcome.REMINDED : Outcome.NONE;
        }
        return Outcome.NONE;
    }

    private boolean remindFirst(NeedsInfoReviewRepository.NeedsInfoCase row, Instant now) {
        if (!reviews.markFirstReminder(row, now)) {
            return false;
        }
        notifier.notify(row.ownerId(), "listing.needs_info_reminder",
                "Your listing still needs info",
                "Please reply or edit your listing so Draazy can finish the review. "
                        + "Listings with no update are archived after 14 days.",
                "/dashboard");
        return true;
    }

    private boolean remindDay7(NeedsInfoReviewRepository.NeedsInfoCase row, Instant now) {
        if (!reviews.markDay7Reminder(row, now)) {
            return false;
        }
        notifier.notify(row.ownerId(), "listing.needs_info_reminder",
                "Your listing still needs info",
                "Please reply or edit your listing in the next 7 days, or we'll archive it for now.",
                "/dashboard");
        return true;
    }

    private boolean archive(NeedsInfoReviewRepository.NeedsInfoCase row, Instant now) {
        if (!reviews.markAutoArchived(row, now)) {
            return false;
        }
        archiveService.archive(SYSTEM_ACTOR, row.propertyId().toString(), ARCHIVE_REASON);
        notifier.notify(row.ownerId(), "listing.needs_info_timeout",
                "Your listing was archived",
                "We archived it because we did not receive the requested info within 14 days. "
                        + "You can restore and resubmit when ready.",
                "/dashboard");
        // audit.record commits on its own, so it goes last: a failure above must not log a rolled-back archive.
        audit.record("system", Roles.Wire.ADMIN, "property.needs_info.timeout_archive",
                "property", row.propertyId().toString(), null,
                "{\"reason\":\"" + ARCHIVE_REASON + "\",\"reviewId\":\"" + row.reviewId() + "\"}");
        return true;
    }

    public record SweepResult(int reminded, int archived) {
    }
}

package com.draazy.api.moderation.verification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.draazy.api.catalog.listing.ListingArchiveService;
import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.trust.Notifier;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.SimpleTransactionStatus;

@DisplayName("Needs-info sweep — each row is its own transaction")
class NeedsInfoSweepIsolationTest {

    private static final Instant NOW = Instant.parse("2026-09-20T00:00:00Z");

    private final NeedsInfoReviewRepository reviews = mock(NeedsInfoReviewRepository.class);
    private final Notifier notifier = mock(Notifier.class);
    private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
    private final NeedsInfoSweepService sweep = new NeedsInfoSweepService(reviews, mock(ListingArchiveService.class),
            mock(AuditService.class), notifier, Clock.fixed(NOW, ZoneOffset.UTC), transactions);

    private static NeedsInfoReviewRepository.NeedsInfoCase dueFirstReminder() {
        return new NeedsInfoReviewRepository.NeedsInfoCase(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                NOW.minus(4, ChronoUnit.DAYS), null, null, null);
    }

    @Test
    @DisplayName("a failing row rolls back alone and the rest of the page still commits")
    void aFailingRowDoesNotRollBackThePage() {
        var bad = dueFirstReminder();
        var good = dueFirstReminder();
        when(transactions.getTransaction(any(TransactionDefinition.class)))
                .thenAnswer(call -> new SimpleTransactionStatus());
        when(reviews.findDue(any(), any(), any(), anyInt())).thenReturn(List.of(bad, good));
        when(reviews.markFirstReminder(any(), any())).thenReturn(true);
        doThrow(new IllegalStateException("inbox down")).when(notifier)
                .notify(eq(bad.ownerId()), any(), any(), any(), any());

        var result = sweep.sweep();

        assertThat(result).isEqualTo(new NeedsInfoSweepService.SweepResult(1, 0));
        verify(transactions, times(1)).rollback(any());
        verify(transactions, times(2)).commit(any());
        verify(notifier).notify(eq(good.ownerId()), eq("listing.needs_info_reminder"), any(), any(), any());
    }
}

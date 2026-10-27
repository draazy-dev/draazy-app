package com.draazy.api.identity.verification;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionSynchronizationUtils;

@DisplayName("Identity rejection notice — WhatsApp leaves only after the decision commits")
class IdentityRejectionNoticeTest {

    private final Notifier notifier = mock(Notifier.class);
    private final UserRepository users = mock(UserRepository.class);
    private final DecisionMessenger messenger = mock(DecisionMessenger.class);
    private final IdentityRejectionNotice notice = new IdentityRejectionNotice(notifier, users, messenger);
    private final UUID userId = UUID.randomUUID();

    @AfterEach
    void closeSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private void optedInUser() {
        when(users.findById(userId)).thenReturn(Optional.of(new User("9830000999", "owner")));
        when(notifier.allowsWhatsapp(userId)).thenReturn(true);
    }

    @Test
    @DisplayName("inside a transaction the line waits for commit and is dropped on rollback")
    void sendsOnlyAfterCommit() {
        optedInUser();
        TransactionSynchronizationManager.initSynchronization();

        notice.send(userId, "note");

        verify(notifier).notify(userId, "identity.rejected", "Verification needs another try", "note",
                "/verify-identity");
        verify(messenger, never()).sendIdentityDecision(anyString(), anyString());

        TransactionSynchronizationUtils.triggerAfterCommit();
        verify(messenger).sendIdentityDecision(anyString(), anyString());
    }

    @Test
    @DisplayName("a rolled-back decision sends nothing")
    void rollbackSendsNothing() {
        optedInUser();
        TransactionSynchronizationManager.initSynchronization();

        notice.send(userId, "note");
        TransactionSynchronizationUtils.triggerAfterCompletion(
                org.springframework.transaction.support.TransactionSynchronization.STATUS_ROLLED_BACK);

        verify(messenger, never()).sendIdentityDecision(anyString(), anyString());
    }

    @Test
    @DisplayName("a user who has not opted in to WhatsApp only gets the inbox row")
    void optedOutGetsNoWhatsapp() {
        when(users.findById(userId)).thenReturn(Optional.of(new User("9830000998", "owner")));
        when(notifier.allowsWhatsapp(userId)).thenReturn(false);

        notice.send(userId, "note");

        verify(messenger, never()).sendIdentityDecision(anyString(), anyString());
    }
}

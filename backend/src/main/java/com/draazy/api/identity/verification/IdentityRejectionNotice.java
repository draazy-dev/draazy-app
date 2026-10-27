package com.draazy.api.identity.verification;

import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** The inbox row joins the caller's transaction; the WhatsApp line leaves only once it commits, so a rolled-back
 * decision never reaches the user. */
@Component
class IdentityRejectionNotice {

    private static final String WHATSAPP_LINE = "Your Draazy identity verification could not be completed. "
            + "Open the app to see the reason and retake your photos.";

    private final Notifier notifier;
    private final UserRepository users;
    private final DecisionMessenger decisionMessenger;

    IdentityRejectionNotice(Notifier notifier, UserRepository users, DecisionMessenger decisionMessenger) {
        this.notifier = notifier;
        this.users = users;
        this.decisionMessenger = decisionMessenger;
    }

    void send(UUID userId, String text) {
        notifier.notify(userId, "identity.rejected", "Verification needs another try", text, "/verify-identity");
        users.findById(userId).filter(user -> notifier.allowsWhatsapp(userId)).map(User::getMobile)
                .ifPresent(mobile -> afterCommit(() -> decisionMessenger.sendIdentityDecision(mobile, WHATSAPP_LINE)));
    }

    private static void afterCommit(Runnable send) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            send.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                send.run();
            }
        });
    }
}

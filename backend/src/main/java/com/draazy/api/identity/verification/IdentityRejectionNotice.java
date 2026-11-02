package com.draazy.api.identity.verification;

import com.draazy.api.common.persistence.AfterCommit;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import java.util.UUID;
import org.springframework.stereotype.Component;

// The inbox row joins the caller's transaction; the WhatsApp line leaves only after commit,
// so a rolled-back decision never reaches the user.
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
                .ifPresent(mobile -> AfterCommit.run(() -> decisionMessenger.sendIdentityDecision(mobile, WHATSAPP_LINE)));
    }
}

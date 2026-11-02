package com.draazy.api.bootstrap;

import com.draazy.api.billing.plan.PlansController;
import com.draazy.api.common.web.Routes;
import com.draazy.api.engagement.notification.NotificationController;
import com.draazy.api.engagement.requests.RequestInboxController;
import com.draazy.api.engagement.saved.SavedPropertyController;
import com.draazy.api.identity.user.MeController;
import com.draazy.api.leads.conversation.ConversationsController;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeBootstrapController {
    private static final Logger log = LoggerFactory.getLogger(MeBootstrapController.class);

    private final MeController me;
    private final PlansController plans;
    private final SavedPropertyController saved;
    private final NotificationController notifications;
    private final ConversationsController conversations;
    private final RequestInboxController requests;

    public MeBootstrapController(MeController me, PlansController plans,
            SavedPropertyController saved, NotificationController notifications,
            ConversationsController conversations, RequestInboxController requests) {
        this.me = me;
        this.plans = plans;
        this.saved = saved;
        this.notifications = notifications;
        this.conversations = conversations;
        this.requests = requests;
    }

    @GetMapping(Routes.Bootstrap.ME)
    public MeBootstrapResponse bootstrap(@CurrentUser AuthPrincipal principal) {
        return new MeBootstrapResponse(
                me.getMe(principal),
                section("subscription", () -> plans.getSubscription(principal)),
                section("saved", () -> saved.listKeys(principal)),
                section("notificationsUnread", () -> notifications.unreadCount(principal)),
                section("messagesUnread", () -> conversations.unreadCount(principal)),
                section("requestsPending", () -> requests.pendingCount(principal)));
    }

    private static <T> T section(String name, Supplier<T> read) {
        try {
            return read.get();
        } catch (RuntimeException e) {
            log.warn("me/bootstrap section {} failed; the client will re-read it directly", name, e);
            return null;
        }
    }
}
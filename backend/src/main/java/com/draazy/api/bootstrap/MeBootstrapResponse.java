package com.draazy.api.bootstrap;

import com.draazy.api.billing.plan.SubscriptionState;
import com.draazy.api.engagement.notification.NotificationController;
import com.draazy.api.engagement.requests.RequestInboxService;
import com.draazy.api.engagement.saved.SavedKey;
import com.draazy.api.identity.user.SelfResponse;
import com.draazy.api.leads.conversation.ConversationService;
import java.util.List;

public record MeBootstrapResponse(
        SelfResponse me,
        SubscriptionState subscription,
        List<SavedKey> saved,
        NotificationController.CountResponse notificationsUnread,
        ConversationService.UnreadCount messagesUnread,
        RequestInboxService.PendingCount requestsPending) {
}
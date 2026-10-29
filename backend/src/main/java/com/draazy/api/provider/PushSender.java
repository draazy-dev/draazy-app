package com.draazy.api.provider;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

public interface PushSender {
    boolean send(String endpoint, String p256dh, String auth, PushPayloads.Payload payload);
}

@Component
@ConditionalOnExpression("'${draazy.providers.push.vapid-private-key:}'.isBlank()")
class LoggingPushSender implements PushSender {
    private static final Logger LOG = LoggerFactory.getLogger(LoggingPushSender.class);

    @Override
    public boolean send(String endpoint, String p256dh, String auth, PushPayloads.Payload payload) {
        LOG.info("Dev push notification queued conversationId={}", conversationId(payload));
        return true;
    }

    private static String conversationId(PushPayloads.Payload payload) {
        String id = payload.url().startsWith("/messages?c=") ? payload.url().substring("/messages?c=".length()) : "";
        return id.isEmpty() || id.startsWith("request:") ? "unknown" : id;
    }
}

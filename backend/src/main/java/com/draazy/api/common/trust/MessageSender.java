package com.draazy.api.common.trust;

public interface MessageSender {
    Prepared send(MessageRequest request);

    record MessageRequest(
            String channel,
            String templateId,
            String subjectType,
            java.util.UUID subjectId,
            java.util.UUID recipientId,
            String recipientMobile,
            java.util.UUID preparedBy,
            java.util.Map<String, String> variables) {}

    record Prepared(java.util.UUID id, String body, String status, String handoffLink) {}
}

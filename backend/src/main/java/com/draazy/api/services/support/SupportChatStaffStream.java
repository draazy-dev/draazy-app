package com.draazy.api.services.support;

import com.draazy.api.leads.conversation.MessageEventHub;
import com.draazy.api.services.support.StaffSupportChatDto.Row;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Rides the per-user event hub: connected desk staff are remembered here so inbox changes reach them. */
@Component
class SupportChatStaffStream {
    private final MessageEventHub hub;
    private final SupportChatInbox inbox;
    private final Map<UUID, SupportChatScope> connected = new ConcurrentHashMap<>();

    SupportChatStaffStream(MessageEventHub hub, SupportChatInbox inbox) {
        this.hub = hub;
        this.inbox = inbox;
    }

    SseEmitter connect(UUID staffId, SupportChatScope scope) {
        connected.put(staffId, scope);
        return hub.connect(staffId, () -> connected.remove(staffId));
    }

    /** Each connected staff member gets the row as their own scope sees it, or nothing if it is not theirs. */
    void publish(UUID customerId) {
        Map<SupportChatScope, Row> rows = new HashMap<>();
        connected.forEach((staffId, scope) -> {
            if (!rows.containsKey(scope)) {
                rows.put(scope, inbox.row(customerId, scope));
            }
            Row row = rows.get(scope);
            if (row != null) {
                hub.publish(staffId, "chat", row);
            }
        });
    }
}

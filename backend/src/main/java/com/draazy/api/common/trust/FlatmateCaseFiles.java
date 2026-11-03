package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public interface FlatmateCaseFiles {
    String KIND_POST = "post";
    String KIND_ROOM = "room";
    String KIND_GROUP = "group";

    void requireTicked(String kind, UUID postId);

    CaseView view(String kind, UUID postId, UUID hostId);

    void tick(String kind, UUID postId, UUID actorId, String item, boolean pass);

    void needsInfo(String kind, UUID postId, UUID actorId, String reasonCode, String note);

    void approved(String kind, UUID postId, UUID actorId, String note);

    void rejected(String kind, UUID postId, UUID actorId, String reasonCode, String note);

    void reply(String kind, UUID postId, UUID hostId, String body);

    void reopen(String kind, UUID postId);

    void markRead(String kind, UUID postId, UUID hostId);

    void markHostMessagesRead(String kind, UUID postId, UUID hostId);

    Map<UUID, CaseSummary> summaries(Map<UUID, UUID> hostIdByPostId);

    record CaseView(String status, String reasonCode, String reasonNote, List<Check> checklist,
            List<Message> messages, Instant decidedAt) {
    }

    record Check(String item, boolean pass) {
    }

    record Message(String id, String from, String body, Instant at, boolean read,
            boolean clarificationRequested) {
    }

    record CaseSummary(String status, String reasonCode, String reasonNote, int unreadForHost,
            int unreadFromHost, Instant updatedAt, String lastMessage) {
    }
}

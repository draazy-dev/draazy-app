package com.draazy.api.common.audit;

import com.draazy.api.security.AuthPrincipal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Service
public class AuditService {
    // Metadata is serialised, never concatenated: free text in it must not be able to forge fields.
    private static final ObjectMapper METADATA_JSON = JsonMapper.builder().build();

    private final AuditLogRepository repository;

    public AuditService(AuditLogRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actor, String actorRole, String action, String entity, String entityId) {
        record(actor, actorRole, action, entity, entityId, null, "{}");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actor, String actorRole, String action, String entity, String entityId,
            String checker, String metadataJson) {
        repository.save(new AuditLog(actor, actorRole, action, entity, entityId, checker, metadataJson));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actor, String actorRole, String action, String entity, String entityId,
            Map<String, Object> metadata) {
        record(actor, actorRole, action, entity, entityId, null, METADATA_JSON.writeValueAsString(metadata));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean recordOnce(String actor, String actorRole, String action, String entity, String entityId,
            Map<String, Object> metadata) {
        if (repository.existsByActorAndActionAndEntityId(actor, action, entityId)) {
            return false;
        }
        record(actor, actorRole, action, entity, entityId, metadata);
        return true;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID actorId, String actorRole, String action, String entity, String entityId) {
        record(actorId.toString(), actorRole, action, entity, entityId, null, "{}");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(AuthPrincipal actor, String action, String entity, String entityId,
            Object... context) {
        if (context.length % 2 != 0) {
            throw new IllegalArgumentException(
                    "audit context must be alternating key/value pairs, got " + context.length);
        }
        Map<String, Object> metadata = new LinkedHashMap<>();
        for (int i = 0; i < context.length; i += 2) {
            metadata.put(String.valueOf(context[i]), context[i + 1]);
        }
        record(actor.userId().toString(), actor.role(), action, entity, entityId, null,
                METADATA_JSON.writeValueAsString(metadata));
    }
}

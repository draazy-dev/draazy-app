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

/** The single write path into the append-only {@code audit_log}; actor and role are server-resolved. */
@Service
public class AuditService {

    // Metadata is serialised, never concatenated: free text in it must not be able to forge fields.
    private static final ObjectMapper METADATA_JSON = JsonMapper.builder().build();

    private final AuditLogRepository repository;

    public AuditService(AuditLogRepository repository) {
        this.repository = repository;
    }

    /** Record a privileged action with no structured context. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actor, String actorRole, String action, String entity, String entityId) {
        record(actor, actorRole, action, entity, entityId, null, "{}");
    }

    /** Records a privileged action; {@code checker} is the second party of a maker-checker flow, else null. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actor, String actorRole, String action, String entity, String entityId,
            String checker, String metadataJson) {
        repository.save(new AuditLog(actor, actorRole, action, entity, entityId, checker, metadataJson));
    }

    /** Record a privileged action with a metadata map the service serialises, so provider text cannot forge fields. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String actor, String actorRole, String action, String entity, String entityId,
            Map<String, Object> metadata) {
        record(actor, actorRole, action, entity, entityId, null, METADATA_JSON.writeValueAsString(metadata));
    }

    /** As above, but only the first time for this entity id; false when it was already recorded. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean recordOnce(String actor, String actorRole, String action, String entity, String entityId,
            Map<String, Object> metadata) {
        if (repository.existsByActorAndActionAndEntityId(actor, action, entityId)) {
            return false;
        }
        record(actor, actorRole, action, entity, entityId, metadata);
        return true;
    }

    /** Convenience overload keyed by the acting user's id. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(UUID actorId, String actorRole, String action, String entity, String entityId) {
        record(actorId.toString(), actorRole, action, entity, entityId, null, "{}");
    }

    /** Takes actor and role from the principal; context is key/value pairs, and null values are kept as JSON null. */
    // A serialisation failure propagates: refusing the action beats performing it and filing an empty note.
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


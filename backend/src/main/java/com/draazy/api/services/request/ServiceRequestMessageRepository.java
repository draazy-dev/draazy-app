package com.draazy.api.services.request;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ServiceRequestMessageRepository extends JpaRepository<ServiceRequestMessage, UUID> {
    List<ServiceRequestMessage> findByRequestIdInOrderByCreatedAtAsc(Collection<UUID> requestIds);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ServiceRequestMessage m set m.readAt = :at
            where m.requestId = :requestId
              and m.readAt is null
              and m.authorRole in :roles
            """)
    int markRead(@Param("requestId") UUID requestId,
            @Param("roles") Collection<String> roles,
            @Param("at") Instant at);
}

package com.draazy.api.moderation.note;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InternalNoteRepository extends JpaRepository<InternalNote, UUID> {
    List<InternalNote> findByEntityTypeAndEntityIdOrderByCreatedAtDesc(String entityType,
            String entityId);

    @Query("""
            select n.entityId, count(n)
              from InternalNote n
             where n.entityType = :entityType
               and n.entityId in :entityIds
             group by n.entityId
            """)
    List<Object[]> countByEntityTypeAndEntityIdIn(@Param("entityType") String entityType,
            @Param("entityIds") Collection<String> entityIds);
}

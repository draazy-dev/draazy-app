package com.draazy.api.engagement.messaging;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface OutboundMessageRepository extends JpaRepository<OutboundMessage, UUID> {
    List<OutboundMessage> findBySubjectTypeAndSubjectIdOrderByPreparedAtDesc(String subjectType, UUID subjectId);

    @Query("""
            select m.subjectId, count(m)
            from OutboundMessage m
            where m.subjectType = :subjectType and m.subjectId in :subjectIds
            group by m.subjectId
            """)
    List<Object[]> countBySubjects(
            @Param("subjectType") String subjectType, @Param("subjectIds") java.util.Collection<UUID> subjectIds);
}

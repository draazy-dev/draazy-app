package com.draazy.api.moderation.report;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReportRepository extends JpaRepository<Report, UUID> {
    long countByReporterIdAndCreatedAtAfter(UUID reporterId, Instant since);

    Page<Report> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<Report> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);

    @Query("""
            select r from Report r
            where (:status is null or r.status = :status)
              and (:reason is null or r.reason = :reason)
              and (:targetType is null or r.targetType = :targetType)
              and r.createdAt >= :since
              and (:like is null or lower(r.targetId) like :like escape '\\' or lower(r.reason) like :like escape '\\'
                   or lower(coalesce(r.details, '')) like :like escape '\\'
                   or lower(cast(r.id as string)) like :like escape '\\')
            order by r.createdAt desc
            """)
    Page<Report> search(@Param("status") String status,
            @Param("reason") String reason,
            @Param("targetType") String targetType,
            @Param("like") String like,
            @Param("since") Instant since,
            Pageable pageable);

    @Query("select r.targetType, count(r) from Report r where r.status in :statuses group by r.targetType")
    List<Object[]> countByTargetType(@Param("statuses") Collection<String> statuses);

    @Query("select r.status, count(r) from Report r where (:targetType is null or r.targetType = :targetType) group by r.status")
    List<Object[]> countByStatus(@Param("targetType") String targetType);

    @Query("select r.targetId, count(r) from Report r where r.targetId in :targetIds group by r.targetId")
    List<Object[]> countByTarget(@Param("targetIds") Collection<String> targetIds);

    long countByStatusIn(Collection<String> statuses);

    boolean existsByReporterIdAndTargetTypeAndTargetIdAndStatusIn(
            UUID reporterId, String targetType, String targetId, Collection<String> statuses);
}

package com.draazy.api.services.ticket;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TicketRepository extends JpaRepository<Ticket, UUID> {
    @Query("""
            select t from Ticket t
            where (:allTeams = true or t.team in :teams or (:unassigned = true and t.team is null))
              and (:status is null or t.status = :status)
            order by t.createdAt desc
            """)
    Page<Ticket> findForBoard(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams,
            @Param("unassigned") boolean unassigned,
            @Param("status") String status,
            Pageable pageable);

    @Query("""
            select t from Ticket t
            where (:allTeams = true or t.team in :teams or (:unassigned = true and t.team is null))
              and (:status is null or t.status = :status)
              and (:priority is null or t.priority = :priority)
              and t.createdAt >= :since
              and (:q is null
                   or lower(cast(t.id as string)) like :q escape '\\'
                   or lower(t.subject) like :q escape '\\'
                   or lower(t.service) like :q escape '\\'
                   or lower(t.customer) like :q escape '\\'
                   or lower(t.detail) like :q escape '\\'
                   or t.mobile like :q escape '\\')
            order by t.createdAt desc
            """)
    Page<Ticket> findRowsForBoard(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams,
            @Param("unassigned") boolean unassigned,
            @Param("status") String status,
            @Param("priority") String priority,
            @Param("q") String q,
            @Param("since") Instant since,
            Pageable pageable);

    @Query("""
            select t.status as status, count(t) as total from Ticket t
            where (:allTeams = true or t.team in :teams or (:unassigned = true and t.team is null))
            group by t.status
            """)
    List<StatusTotal> countByStatusForBoard(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams,
            @Param("unassigned") boolean unassigned);

    interface StatusTotal {
        String getStatus();

        long getTotal();
    }

    @Query("""
            select count(t) from Ticket t
            where (:allTeams = true or t.team in :teams or (:unassigned = true and t.team is null))
              and t.status = :status
            """)
    long countForBoard(@Param("allTeams") boolean allTeams,
            @Param("teams") List<String> teams,
            @Param("unassigned") boolean unassigned,
            @Param("status") String status);

    long countByMobileAndCreatedAtAfter(String mobile, Instant since);

    boolean existsByMobileAndSubjectAndStatusIn(String mobile, String subject,
            Collection<String> statuses);
}

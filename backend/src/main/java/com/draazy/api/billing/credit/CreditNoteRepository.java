package com.draazy.api.billing.credit;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CreditNoteRepository extends JpaRepository<CreditNote, UUID> {

    Optional<CreditNote> findBySourceTypeAndSourceId(String sourceType, UUID sourceId);

    List<CreditNote> findBySourceTypeAndSourceIdIn(String sourceType, Collection<UUID> sourceIds);

    List<CreditNote> findByUserIdOrderByIssuedAtDesc(UUID userId);

    @Query("select coalesce(sum(c.taxableAmount), 0) from CreditNote c where c.invoiceNo = :invoiceNo")
    long creditedTaxable(@Param("invoiceNo") String invoiceNo);
}
package com.draazy.api.billing.credit;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID> {

    Optional<Invoice> findBySourceTypeAndSourceId(String sourceType, UUID sourceId);

    Optional<Invoice> findByOrderRef(String orderRef);

    List<Invoice> findBySourceTypeAndSourceIdIn(String sourceType, Collection<UUID> sourceIds);
}

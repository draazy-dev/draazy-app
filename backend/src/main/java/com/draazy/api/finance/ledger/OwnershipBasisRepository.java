package com.draazy.api.finance.ledger;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnershipBasisRepository extends JpaRepository<OwnershipBasis, UUID> {
}

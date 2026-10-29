package com.draazy.api.common.access;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

// Only primary-key operations: the grant may be selected solely by the signature-verified
// principal's id, never by a request-supplied value.
public interface BackOfficeGrantRepository extends JpaRepository<BackOfficeGrant, UUID> {
}

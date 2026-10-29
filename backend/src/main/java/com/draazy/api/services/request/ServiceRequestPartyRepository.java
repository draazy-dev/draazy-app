package com.draazy.api.services.request;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceRequestPartyRepository extends JpaRepository<ServiceRequestParty, UUID> {
    List<ServiceRequestParty> findByRequestIdOrderByRoleAscPartyIndexAscCreatedAtAsc(UUID requestId);

    default List<ServiceRequestParty> findByRequestId(UUID requestId) {
        return findByRequestIdOrderByRoleAscPartyIndexAscCreatedAtAsc(requestId);
    }

    List<ServiceRequestParty> findByRequestIdIn(List<UUID> requestIds);

    List<ServiceRequestParty> findByUserIdAndStatusOrderByCreatedAtDesc(UUID userId, String status);

    boolean existsByRequestIdAndStatus(UUID requestId, String status);

    long countByRequestIdAndStatus(UUID requestId, String status);

    boolean existsByRequestIdAndUserIdAndStatus(UUID requestId, UUID userId, String status);

    boolean existsByRequestIdAndUserId(UUID requestId, UUID userId);

    List<ServiceRequestParty> findByMobile(String mobile);

    boolean existsByRequestIdAndMobile(UUID requestId, String mobile);

    boolean existsByRequestIdAndRoleAndPartyIndex(UUID requestId, String role, int partyIndex);

    long deleteByInviteExpiresAtBefore(Instant cutoff);
}

package com.draazy.api.identity.auth;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StaffInviteRepository extends JpaRepository<StaffInvite, UUID> {
    boolean existsByUserIdAndRedeemedAtIsNull(UUID userId);

    void deleteByUserIdAndRedeemedAtIsNull(UUID userId);
}

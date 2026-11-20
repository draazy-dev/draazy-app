package com.draazy.api.engagement.flatmate;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FlatmateOwnerConsentRepository extends JpaRepository<FlatmateOwnerConsent, UUID> {
    boolean existsByOwnerMobileAndGrantedByAndAddressFingerprint(
            String ownerMobile, UUID grantedBy, String addressFingerprint);

    @Modifying
    @Query(value = """
            insert into flatmate_owner_consents (owner_mobile, granted_by, address_fingerprint)
                 values (:ownerMobile, cast(:grantedBy as uuid), :fingerprint)
            on conflict (owner_mobile, granted_by, coalesce(address_fingerprint, ''))
             do nothing""", nativeQuery = true)
    void insertIfAbsent(@Param("ownerMobile") String ownerMobile,
            @Param("grantedBy") String grantedBy, @Param("fingerprint") String fingerprint);
}

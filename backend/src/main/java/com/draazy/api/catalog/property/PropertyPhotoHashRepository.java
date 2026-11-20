package com.draazy.api.catalog.property;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PropertyPhotoHashRepository
        extends JpaRepository<PropertyPhotoHash, PropertyPhotoHash.Key> {
    @Query("""
            select h from PropertyPhotoHash h, Property p
            where p.id = h.propertyId
              and p.owner.id <> :ownerId
              and p.archived = false
              and p.status in :statuses
              and (
                    h.band0 in :bands0
                 or h.band1 in :bands1
                 or h.band2 in :bands2
                 or h.band3 in :bands3
              )
            """)
    List<PropertyPhotoHash> findBandCandidates(
            @Param("ownerId") UUID ownerId,
            @Param("statuses") Collection<String> statuses,
            @Param("bands0") Collection<Integer> bands0,
            @Param("bands1") Collection<Integer> bands1,
            @Param("bands2") Collection<Integer> bands2,
            @Param("bands3") Collection<Integer> bands3,
            Pageable pageable);

    @Modifying
    void deleteByPropertyId(UUID propertyId);

    List<PropertyPhotoHash> findByPropertyId(UUID propertyId);

    List<PropertyPhotoHash> findByPropertyIdIn(Collection<UUID> propertyIds);
}

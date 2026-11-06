package com.draazy.api.catalog.locality;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LocalityRepository extends JpaRepository<Locality, String> {
    Optional<Locality> findByPlaceId(String placeId);

    List<Locality> findByNameIgnoreCaseAndArchivedAtIsNull(String name);

    Optional<Locality> findBySlugAndArchivedAtIsNull(String slug);

    @Query("""
            select l from Locality l
            where l.archivedAt is null and lower(l.name) like concat('%', lower(:q), '%')
            order by case when lower(l.name) like concat(lower(:q), '%') then 0 else 1 end, l.name
            """)
    List<Locality> searchLive(@Param("q") String q, Pageable page);

    @Query(value = """
            select * from localities l
            where l.archived_at is null and word_similarity(lower(:q), lower(l.name)) >= 0.5
            order by word_similarity(lower(:q), lower(l.name)) desc, l.name
            limit :size""", nativeQuery = true)
    List<Locality> searchLiveClose(@Param("q") String q, @Param("size") int size);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            insert into localities (slug, name, city, lat, lng, place_id, active, district, district_checked_at)
            values (:slug, :name, :city, :lat, :lng, :placeId, true, :district, now())
            on conflict do nothing""", nativeQuery = true)
    int mint(@Param("slug") String slug, @Param("name") String name, @Param("city") String city,
            @Param("placeId") String placeId, @Param("lat") double lat, @Param("lng") double lng,
            @Param("district") String district);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            update localities
            set place_id = :placeId, name = :name, lat = :lat, lng = :lng, active = true, archived_at = null,
                district = :district, district_checked_at = now()
            where slug = :slug and place_id is null and active = false""", nativeQuery = true)
    int adopt(@Param("slug") String slug, @Param("placeId") String placeId, @Param("name") String name,
            @Param("lat") double lat, @Param("lng") double lng, @Param("district") String district);
}

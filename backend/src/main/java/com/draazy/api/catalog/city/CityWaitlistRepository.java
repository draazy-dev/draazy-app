package com.draazy.api.catalog.city;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CityWaitlistRepository extends JpaRepository<CityWaitlistEntry, UUID> {
    // Native ON CONFLICT DO NOTHING: save-and-catch marks the transaction rollback-only, and an
    // exists-check races. The conflict target must match uq_city_waitlist_mobile_city exactly.
    @Modifying
    @Query(value = """
            insert into city_waitlist (mobile, city, email)
            values (:mobile, :city, :email)
            on conflict (mobile, lower(city)) do nothing""",
            nativeQuery = true)
    int insertIfAbsent(@Param("mobile") String mobile,
            @Param("city") String city,
            @Param("email") String email);

    @Query("""
            select new com.draazy.api.catalog.city.CityWaitlistDemandRow(
                min(w.city), count(w), max(w.createdAt))
            from CityWaitlistEntry w
            group by lower(w.city)
            order by count(w) desc, max(w.createdAt) desc""")
    List<CityWaitlistDemandRow> demandByCity();
}

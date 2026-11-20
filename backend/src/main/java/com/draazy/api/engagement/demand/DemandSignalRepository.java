package com.draazy.api.engagement.demand;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DemandSignalRepository extends JpaRepository<DemandSignal, UUID> {
    @Query(value = """
            select locality_slug                                       as localitySlug,
                   count(*) filter (where kind = 'search')             as searches,
                   count(*) filter (where kind = 'alert')              as alerts,
                   count(*) filter (where kind = 'view')               as views
            from demand_signals
            where created_at >= :since
            group by locality_slug""", nativeQuery = true)
    List<DemandByLocality> aggregateSince(@Param("since") Instant since);

    @Query(value = """
            select locality_slug as localitySlug, count(*) as seekers
            from (
                select locality_slug, user_id
                from demand_signals
                where created_at >= :since
                  and kind = 'search'
                  and user_id is not null
                  and locality_slug is not null
                group by locality_slug, user_id
                having count(*) >= 3
            ) repeat_searchers
            group by locality_slug""", nativeQuery = true)
    List<RepeatSeekersByLocality> repeatSeekersSince(@Param("since") Instant since);

    int REPEAT_THRESHOLD = 3;

    interface DemandByLocality {
        String getLocalitySlug();

        long getSearches();

        long getAlerts();

        long getViews();
    }

    interface RepeatSeekersByLocality {
        String getLocalitySlug();

        long getSeekers();
    }
}

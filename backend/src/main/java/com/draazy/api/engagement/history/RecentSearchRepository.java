package com.draazy.api.engagement.history;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

interface RecentSearchRepository extends JpaRepository<RecentSearch, UUID> {
    List<RecentSearch> findByUserIdOrderBySearchedAtDesc(UUID userId, Limit limit);

    List<RecentSearch> findByUserIdOrderBySearchedAtDesc(UUID userId);

    Optional<RecentSearch> findByUserIdAndUrl(UUID userId, String url);
}

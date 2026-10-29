package com.draazy.api.catalog.society;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

public final class SocietySort {
    static final String RELEVANCE = "relevance";
    static final String RATING = "rating";
    static final String HOMES = "homes";

    private static final Set<String> ALLOWED = Set.of("name", "occupancy", "year", "units");
    private static final Set<String> RANKED = Set.of(RELEVANCE, RATING, HOMES);
    private static final Sort DEFAULT = Sort.by(Sort.Direction.ASC, "name");

    private SocietySort() {
    }

    static Optional<String> ranking(Pageable pageable) {
        return pageable.getSort().stream().findFirst()
                .map(Sort.Order::getProperty).filter(RANKED::contains);
    }

    public static Pageable sanitize(Pageable pageable) {
        List<Sort.Order> safe = pageable.getSort().stream()
                .filter(o -> ALLOWED.contains(o.getProperty()))
                .toList();
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                safe.isEmpty() ? DEFAULT : Sort.by(safe));
    }

    static Pageable tieBroken(Pageable sanitized) {
        return PageRequest.of(sanitized.getPageNumber(), sanitized.getPageSize(),
                sanitized.getSort().and(Sort.by("slug")));
    }
}

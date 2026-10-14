package com.draazy.api.common.web;

import com.draazy.api.common.error.BadRequestException;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/** api-standards.md §5: a list endpoint either whitelists its sortable fields or fixes its order server-side. */
public final class Pageables {

    private Pageables() {
    }

    /** Spring binds {@code ?sort=} anyway; on a fixed-order endpoint an unknown property would be a 500. */
    public static Pageable unsorted(Pageable pageable) {
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
    }

    /** For an endpoint that publishes a sort: any property outside {@code allowed} is a 400 naming the legal ones. */
    public static Pageable allowSort(Pageable pageable, Set<String> allowed) {
        pageable.getSort().stream()
                .filter(order -> !allowed.contains(order.getProperty()))
                .findFirst()
                .ifPresent(order -> {
                    throw new BadRequestException("sort must be one of " + new TreeSet<>(allowed));
                });
        return pageable;
    }
}

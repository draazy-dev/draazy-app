package com.draazy.api.common.web;

import com.draazy.api.common.error.BadRequestException;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

public final class Pageables {
    private Pageables() {
    }

    public static Pageable unsorted(Pageable pageable) {
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
    }

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

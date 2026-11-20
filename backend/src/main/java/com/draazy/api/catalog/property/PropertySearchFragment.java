package com.draazy.api.catalog.property;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

interface PropertySearchFragment {
    List<Property> findPage(Specification<Property> spec, Pageable pageable);

    Totals countTotals(Specification<Property> spec, Specification<Property> verified,
            Specification<Property> unstated);

    record Totals(long total, long verified, long unstated) {
    }
}

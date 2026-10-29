package com.draazy.api.catalog.property;

import com.draazy.api.common.web.PageResponse;
import java.util.List;

public record PropertySearchResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        String sort,
        long verifiedElements,
        long unstatedElements) {
    public static <T> PropertySearchResponse<T> of(PageResponse<T> page, long verifiedElements,
            long unstatedElements) {
        return new PropertySearchResponse<>(
                page.content(),
                page.page(),
                page.size(),
                page.totalElements(),
                page.totalPages(),
                page.sort(),
                verifiedElements,
                unstatedElements);
    }
}

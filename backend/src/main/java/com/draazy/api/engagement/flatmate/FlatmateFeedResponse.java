package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.web.PageResponse;
import com.draazy.api.engagement.livingstyle.LivingStyleCatalogue;
import java.util.List;
import java.util.Map;

public record FlatmateFeedResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        String sort,
        long verifiedElements,
        long otherTabElements,
        Map<String, Long> tabElements,
        Map<String, Integer> matches,
        Map<String, List<LivingStyleCatalogue.Shared>> sharedVibes) {
    public static <T> FlatmateFeedResponse<T> of(PageResponse<T> page, FlatmateFeedService.FeedResult result) {
        return new FlatmateFeedResponse<>(
                page.content(),
                page.page(),
                page.size(),
                page.totalElements(),
                page.totalPages(),
                page.sort(),
                result.verifiedTotal(),
                result.otherTabTotal(),
                result.tabTotals(),
                result.matches(),
                result.sharedVibes());
    }
}

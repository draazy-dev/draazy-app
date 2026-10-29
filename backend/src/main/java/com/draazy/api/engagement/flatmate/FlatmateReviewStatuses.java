package com.draazy.api.engagement.flatmate;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
class FlatmateReviewStatuses {
    private final FlatmateReviewRepository reviews;

    FlatmateReviewStatuses(FlatmateReviewRepository reviews) {
        this.reviews = reviews;
    }

    Map<UUID, String> forGroups(Collection<FlatmateGroup> window) {
        List<UUID> ids = idsOf(window, FlatmateGroup::getId);
        if (ids.isEmpty()) {
            return Map.of();
        }
        return statuses(reviews.findByGroupIdIn(ids), FlatmateReview::getGroupId);
    }

    Map<UUID, String> forRooms(Collection<FlatmateRoom> window) {
        List<UUID> ids = idsOf(window, FlatmateRoom::getId);
        if (ids.isEmpty()) {
            return Map.of();
        }
        return statuses(reviews.findByRoomIdIn(ids), FlatmateReview::getRoomId);
    }

    private static <T> List<UUID> idsOf(Collection<T> window, java.util.function.Function<T, UUID> id) {
        return window.stream().map(id).filter(Objects::nonNull).distinct().toList();
    }

    private static Map<UUID, String> statuses(
            List<FlatmateReview> rows, java.util.function.Function<FlatmateReview, UUID> subject) {
        return rows.stream()
                .filter(review -> subject.apply(review) != null && review.getStatus() != null)
                .collect(Collectors.toMap(subject, FlatmateReview::getStatus, (first, duplicate) -> first));
    }
}

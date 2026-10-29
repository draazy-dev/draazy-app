package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.User;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record FlatmateModerationQueueDto(
        UUID id,
        String kind,
        String modStatus,
        String authorName,
        String authorMobile,
        String headline,
        String locality,
        String freeText,
        List<String> photos,
        Long rent,
        String recheckReason,
        Instant recheckRequestedAt,
        Instant createdAt) {
    public static final String KIND_POST = "post";
    public static final String KIND_ROOM = "room";
    public static final String KIND_GROUP = "group";

    static FlatmateModerationQueueDto of(FlatmateSeekerPost post, User author) {
        String where = post.getLocalities() == null ? null : String.join(", ", post.getLocalities());
        return new FlatmateModerationQueueDto(post.getId(), KIND_POST, post.getModStatus(),
                nameOf(author), mobileOf(author), post.getName(), where, post.getNote(),
                List.of(), post.getBudgetMax() == null ? post.getBudget() : post.getBudgetMax(),
                post.getRecheck().getReason(), post.getRecheck().getRequestedAt(), post.getCreatedAt());
    }

    static FlatmateModerationQueueDto of(FlatmateRoom room, User author) {
        String headline = room.getSociety() == null ? room.getFlatType()
                : room.getSociety() + (room.getFlatNumber() == null ? "" : " " + room.getFlatNumber());
        return new FlatmateModerationQueueDto(room.getId(), KIND_ROOM, room.getModStatus(),
                nameOf(author), mobileOf(author), headline, room.getLocality(), room.getNote(),
                room.getPhotos() == null ? List.of() : List.copyOf(room.getPhotos()), room.getBudget(),
                room.getRecheck().getReason(), room.getRecheck().getRequestedAt(),
                room.getCreatedAt());
    }

    static FlatmateModerationQueueDto of(FlatmateGroup group, User author) {
        return new FlatmateModerationQueueDto(group.getId(), KIND_GROUP, group.getModStatus(),
                nameOf(author), mobileOf(author), group.getTitle(), group.getLocality(),
                group.getNote(), List.of(), group.getRent(), group.getRecheck().getReason(),
                group.getRecheck().getRequestedAt(), group.getCreatedAt());
    }

    private static String nameOf(User u) {
        return u == null ? null : u.getName();
    }

    private static String mobileOf(User u) {
        return u == null ? null : u.getMobile();
    }
}

package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.User;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** One shape for three tables. */
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
        String recheckReason,
        Instant recheckRequestedAt,
        Instant createdAt) {

    public static final String KIND_POST = "post";
    public static final String KIND_ROOM = "room";
    public static final String KIND_GROUP = "group";

    static FlatmateModerationQueueDto of(FlatmateSeekerPost post, User author) {
        // Joined rather than truncated to the first: "Kothrud" and "Kothrud, Baner, Wakad" are
        // different posts to a moderator judging whether somebody is spraying the whole city.
        String where = post.getLocalities() == null ? null : String.join(", ", post.getLocalities());
        return new FlatmateModerationQueueDto(post.getId(), KIND_POST, post.getModStatus(),
                nameOf(author), mobileOf(author), post.getName(), where, post.getNote(),
                List.of(), post.getRecheck().getReason(),
                post.getRecheck().getRequestedAt(), post.getCreatedAt());
    }

    static FlatmateModerationQueueDto of(FlatmateRoom room, User author) {
        // Society and flat number are what a moderator recognises a duplicate listing by, so they
        // are the headline even though the consumer card leads with the room type.
        String headline = room.getSociety() == null ? room.getFlatType()
                : room.getSociety() + (room.getFlatNumber() == null ? "" : " " + room.getFlatNumber());
        return new FlatmateModerationQueueDto(room.getId(), KIND_ROOM, room.getModStatus(),
                nameOf(author), mobileOf(author), headline, room.getLocality(), room.getNote(),
                room.getPhotos() == null ? List.of() : List.copyOf(room.getPhotos()),
                room.getRecheck().getReason(), room.getRecheck().getRequestedAt(),
                room.getCreatedAt());
    }

    static FlatmateModerationQueueDto of(FlatmateGroup group, User author) {
        return new FlatmateModerationQueueDto(group.getId(), KIND_GROUP, group.getModStatus(),
                nameOf(author), mobileOf(author), group.getTitle(), group.getLocality(),
                group.getNote(), List.of(), group.getRecheck().getReason(),
                group.getRecheck().getRequestedAt(), group.getCreatedAt());
    }

    private static String nameOf(User u) {
        return u == null ? null : u.getName();
    }

    private static String mobileOf(User u) {
        return u == null ? null : u.getMobile();
    }
}

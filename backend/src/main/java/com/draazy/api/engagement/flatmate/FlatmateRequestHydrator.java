package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
class FlatmateRequestHydrator {
    private final FlatmateSeekerPostRepository posts;
    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final UserRepository users;

    FlatmateRequestHydrator(FlatmateSeekerPostRepository posts, FlatmateRoomRepository rooms,
            FlatmateGroupRepository groups, UserRepository users) {
        this.posts = posts;
        this.rooms = rooms;
        this.groups = groups;
        this.users = users;
    }

    List<FlatmateRequestDto> hydrate(List<FlatmateRequest> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<UUID, User> requesters = users.findAllById(
                        rows.stream().map(FlatmateRequest::getRequesterId).distinct().toList())
                .stream().collect(Collectors.toMap(User::getId, u -> u));
        Map<UUID, FlatmateSeekerPost> byPost = posts.findAllById(targetsOfKind(rows, "flatmate"))
                .stream().collect(Collectors.toMap(FlatmateSeekerPost::getId, p -> p));
        Map<UUID, FlatmateRoom> byRoom = rooms.findAllById(targetsOfKind(rows, "room"))
                .stream().collect(Collectors.toMap(FlatmateRoom::getId, r -> r));
        Map<UUID, FlatmateGroup> byGroup = groups.findAllById(targetsOfKind(rows, "group"))
                .stream().collect(Collectors.toMap(FlatmateGroup::getId, g -> g));

        return rows.stream().map(row -> {
            User requester = requesters.get(row.getRequesterId());
            Target target = switch (row.getKind()) {
                case "room" -> Target.of(byRoom.get(row.getTargetId()));
                case "group" -> Target.of(byGroup.get(row.getTargetId()));
                default -> Target.of(byPost.get(row.getTargetId()));
            };
            return FlatmateRequestDto.of(row,
                    target.title(),
                    target.locality(),
                    requester == null ? null : requester.getName(),
                    requester == null ? null : requester.getMobile());
        }).toList();
    }

    FlatmateRequestDto hydrateOne(FlatmateRequest row) {
        return hydrate(List.of(row)).getFirst();
    }

    private static List<UUID> targetsOfKind(List<FlatmateRequest> rows, String kind) {
        return rows.stream()
                .filter(row -> kind.equals(row.getKind()))
                .map(FlatmateRequest::getTargetId)
                .distinct()
                .toList();
    }

    private record Target(String title, String locality) {
        private static final Target MISSING = new Target(null, null);

        static Target of(FlatmateSeekerPost post) {
            if (post == null) {
                return MISSING;
            }
            return new Target(post.getName(),
                    post.getLocalities().isEmpty() ? null : post.getLocalities().getFirst());
        }

        static Target of(FlatmateRoom room) {
            if (room == null) {
                return MISSING;
            }
            return new Target(
                    FlatmateVocabulary.blankToNull(room.getSociety()) == null
                            ? room.getRoomType() : room.getSociety(),
                    room.getLocality());
        }

        static Target of(FlatmateGroup group) {
            return group == null ? MISSING : new Target(group.getTitle(), group.getLocality());
        }
    }
}

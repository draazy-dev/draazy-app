package com.draazy.api.engagement.flatmate;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

@Component
class FlatmateRoomCards {
    private final FlatmateRoomRepository rooms;
    private final UserRepository users;
    private final FlatmateMapper mapper;

    private final FlatmateReviewStatuses reviewStatuses;

    FlatmateRoomCards(FlatmateRoomRepository rooms, UserRepository users, FlatmateMapper mapper,
            FlatmateReviewStatuses reviewStatuses) {
        this.rooms = rooms;
        this.users = users;
        this.mapper = mapper;
        this.reviewStatuses = reviewStatuses;
    }

    List<FlatmateRoomFeedDto> render(List<FlatmateRoom> window) {
        Map<UUID, FlatmateMapper.RoomView> views = anonymousViews(window, hostNames(window));
        return window.stream()
                .map(room -> mapper.toFeedDto(room, views.get(room.getId())))
                .toList();
    }

    Map<UUID, FlatmateMapper.RoomView> anonymousViews(
            Collection<FlatmateRoom> window, Map<UUID, String> hostNames) {
        Map<UUID, Integer> ledger = committedByFlat(window);
        Map<UUID, String> verdicts = reviewStatuses.forRooms(window);
        return window.stream().collect(Collectors.toMap(
                FlatmateRoom::getId,
                room -> FlatmateMapper.RoomView.anonymous(
                        committedFor(room, ledger), hostNames.get(room.getHostId()),
                        verdicts.get(room.getId())),
                (first, duplicate) -> first));
    }

    Map<UUID, FlatmateMapper.RoomView> ownerViews(
            Collection<FlatmateRoom> window, String ownerName, String ownerMobile) {
        Map<UUID, Integer> ledger = committedByFlat(window);

        Map<UUID, String> verdicts = reviewStatuses.forRooms(window);
        return window.stream().collect(Collectors.toMap(
                FlatmateRoom::getId,
                room -> new FlatmateMapper.RoomView(
                        committedFor(room, ledger), ownerName, ownerMobile,
                        verdicts.get(room.getId())),
                (first, duplicate) -> first));
    }

    List<FlatmateRoomCard> ownerCards(List<FlatmateRoom> window) {
        Map<UUID, Integer> ledger = committedByFlat(window);
        Map<UUID, String> verdicts = reviewStatuses.forRooms(window);
        return window.stream().map(room -> new FlatmateRoomCard(
                room.getId(), room.getTitle(), room.getPropertyId(), room.getSociety(),
                room.getFlatType(), room.getLocality(), room.getLocalities(), room.getBudget(),
                mapper.shareMax(room, committedFor(room, ledger)), room.getOccupants(),
                mapper.coverOf(room), room.getModStatus(), room.getStatus(), room.getCreatedAt(),
                room.getHostRole(), room.getVerificationTier(), verdicts.get(room.getId())))
                .toList();
    }

    private static int committedFor(FlatmateRoom room, Map<UUID, Integer> ledger) {
        if (!room.isSplitRoom()) {
            return room.getOccupants();
        }
        return ledger.getOrDefault(room.getPropertyId(), room.getOccupants());
    }

    private Map<UUID, Integer> committedByFlat(Collection<FlatmateRoom> window) {
        List<UUID> flats = window.stream()
                .map(FlatmateRoom::getPropertyId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (flats.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Integer> ledger = new HashMap<>();
        for (Object[] row : rooms.committedByFlat(flats)) {
            ledger.put((UUID) row[0], ((Number) row[1]).intValue());
        }
        return ledger;
    }

    private Map<UUID, String> hostNames(Collection<FlatmateRoom> window) {
        List<UUID> hostIds = window.stream()
                .map(FlatmateRoom::getHostId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        return users.findAllById(hostIds).stream()
                .filter(user -> user.getName() != null)
                .collect(Collectors.toMap(User::getId, User::getName));
    }
}

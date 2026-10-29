package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.security.AuthPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FlatmateHostRoomService {
    private final FlatmateRoomRepository rooms;
    private final FlatmateRoomCards cards;

    FlatmateHostRoomService(FlatmateRoomRepository rooms, FlatmateRoomCards cards) {
        this.rooms = rooms;
        this.cards = cards;
    }

    @Transactional(readOnly = true)
    public Page<FlatmateRoomCard> myRooms(AuthPrincipal caller, Pageable pageable) {
        Page<FlatmateRoom> page = rooms.findMine(caller.userId(), pageable);
        List<FlatmateRoomCard> window = cards.ownerCards(page.getContent());
        return new PageImpl<>(window, pageable, page.getTotalElements());
    }

    @Transactional
    public void withdraw(AuthPrincipal caller, UUID roomId) {
        FlatmateRoom room = rooms.findById(roomId)
                .filter(r -> !r.isArchived() && r.getHostId().equals(caller.userId()))
                .orElseThrow(() -> NotFoundException.of("Room"));
        if (room.isSplitRoom()) {
            throw new ConflictException(
                    "This room is part of a flat let room by room, so it cannot be withdrawn on "
                            + "its own — stop letting the whole flat room by room instead. "
                            + "(split_room)");
        }
        room.archive("withdrawn by the host");
        rooms.saveAndFlush(room);
    }
}

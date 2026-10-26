package com.draazy.api.engagement.flatmate;

import java.util.List;

/** {@code tier} is {@code owner} only when the parent is approved and owner-badged; {@code pending}
 * rooms start unbadged and are promoted when it is; {@code flagged} means another host claimed the address. */
public record FlatSplitResult(
        int count,
        String tier,
        boolean pending,
        boolean flagged,
        List<FlatmateRoomDto> rooms) {
}

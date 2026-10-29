package com.draazy.api.engagement.flatmate;

import java.util.List;

public record FlatSplitResult(
        int count,
        String tier,
        boolean pending,
        boolean flagged,
        List<FlatmateRoomDto> rooms) {
}

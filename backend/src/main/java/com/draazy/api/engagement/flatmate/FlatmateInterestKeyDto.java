package com.draazy.api.engagement.flatmate;

import java.util.UUID;

public record FlatmateInterestKeyDto(UUID id, String kind, UUID targetId, String status) {
}

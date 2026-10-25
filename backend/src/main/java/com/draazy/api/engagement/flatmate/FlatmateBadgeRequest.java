package com.draazy.api.engagement.flatmate;

import jakarta.validation.constraints.NotEmpty;
import java.util.Map;

public record FlatmateBadgeRequest(@NotEmpty Map<String, Object> agreementDoc) {
}

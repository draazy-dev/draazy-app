package com.draazy.api.moderation.duplicate;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record DuplicateDismissRequest(@NotEmpty List<String> ids) {
}

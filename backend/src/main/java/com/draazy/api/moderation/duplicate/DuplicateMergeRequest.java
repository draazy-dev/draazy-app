package com.draazy.api.moderation.duplicate;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

// dropIds are explicit: a listing that joined the cluster after the operator looked
// must not be archived.
public record DuplicateMergeRequest(
        @NotBlank String keepId,
        @NotEmpty List<String> dropIds) {
}

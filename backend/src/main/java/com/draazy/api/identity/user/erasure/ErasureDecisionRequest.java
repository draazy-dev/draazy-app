package com.draazy.api.identity.user.erasure;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ErasureDecisionRequest(
        @NotBlank String decision,
        @Size(max = 2000) String note) {
}

package com.draazy.api.identity.user.erasure;

import jakarta.validation.constraints.Size;

public record ErasureCreateRequest(@Size(max = 2000) String reason) {
}

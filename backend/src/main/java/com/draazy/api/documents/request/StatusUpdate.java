package com.draazy.api.documents.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record StatusUpdate(@NotBlank String status, @Size(max = 500) String note) {
}

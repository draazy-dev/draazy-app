package com.draazy.api.services.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;

public record ServiceRequestCreate(
        @NotBlank @Size(max = 64) String type,
        @Size(max = 64) String propertyId,
        Map<String, Object> details,
        @Size(max = 64) String ticketId) {
}

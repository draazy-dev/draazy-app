package com.draazy.api.services.request;

import java.time.Instant;
import java.time.LocalDate;

public record RegistrationDto(
        String documentNo,
        String sro,
        LocalDate registeredOn,
        String grn,
        String recordedBy,
        Instant recordedAt) {
}

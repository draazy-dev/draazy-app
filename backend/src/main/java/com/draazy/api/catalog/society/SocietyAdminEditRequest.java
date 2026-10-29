package com.draazy.api.catalog.society;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.PositiveOrZero;
import java.math.BigDecimal;

public record SocietyAdminEditRequest(
        Boolean registration,
        Boolean conveyance,

        @PositiveOrZero(message = "Maintenance cannot be negative.")
        @DecimalMax(value = "100", message = "Maintenance is rupees per sq ft, not the monthly bill.")
        BigDecimal maintenancePerSqft,

        String adminNote) {
}

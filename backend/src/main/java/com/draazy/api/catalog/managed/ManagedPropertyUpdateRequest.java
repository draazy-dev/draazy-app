package com.draazy.api.catalog.managed;

import com.draazy.api.catalog.property.AreaUnit;
import com.draazy.api.catalog.property.DealIntent;
import com.draazy.api.common.validation.IndianMobile;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.Map;

public record ManagedPropertyUpdateRequest(
        String title,
        @Pattern(regexp = DealIntent.PATTERN, message = DealIntent.PATTERN_MESSAGE) String deal,
        String propertyType,
        BigDecimal bhk,
        @PositiveOrZero Long price,
        String locality,
        String localitySlug,
        String societyId,
        BigDecimal area,
        @Pattern(regexp = AreaUnit.PATTERN, message = AreaUnit.PATTERN_MESSAGE) String areaUnit,
        String furnishing,
        Boolean rented,
        @Size(max = 80) String tenantName,
        @IndianMobile String tenantMobile,
        @PositiveOrZero @Max(ManagedProperty.MAX_MONTHLY_RENT) Long monthlyRent,
        @Min(1) @Max(28) Integer dueDay,
        Map<String, Object> valuation,
        @Pattern(regexp = "^$|^[A-Z]{5}[0-9]{4}[A-Z]$", message = "Enter a valid PAN, like ABCDE1234F")
        String landlordPan) {
}

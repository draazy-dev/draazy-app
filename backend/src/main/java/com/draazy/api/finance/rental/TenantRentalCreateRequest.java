package com.draazy.api.finance.rental;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record TenantRentalCreateRequest(
        @NotBlank @Size(max = 300) String address,
        @NotNull @Positive @Max(10_000_000) Long monthlyRent,
        @PositiveOrZero @Max(100_000_000) Long deposit,
        @NotNull LocalDate leaseStart,
        LocalDate leaseEnd) {
    @AssertTrue(message = "leaseEnd cannot be before leaseStart")
    public boolean isDateRangeOrdered() {
        return leaseStart == null || leaseEnd == null || !leaseEnd.isBefore(leaseStart);
    }

    @AssertTrue(message = "leaseStart must be a real date, and no more than two years ahead")
    public boolean isLeaseStartInRange() {
        return leaseStart == null || RentalDates.isSane(leaseStart);
    }

    @AssertTrue(message = "leaseEnd must be a real date, and no more than two years ahead")
    public boolean isLeaseEndInRange() {
        return leaseEnd == null || RentalDates.isSane(leaseEnd);
    }
    }

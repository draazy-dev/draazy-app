package com.draazy.api.catalog.city;

import jakarta.validation.constraints.NotNull;

public record CityAdminUpdateRequest(@NotNull Boolean live) {
}

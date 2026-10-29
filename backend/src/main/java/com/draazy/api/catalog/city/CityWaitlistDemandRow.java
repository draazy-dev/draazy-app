package com.draazy.api.catalog.city;

import java.time.Instant;

public record CityWaitlistDemandRow(String city, long requests, Instant lastRequestedAt) {
}

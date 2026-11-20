package com.draazy.api.catalog.society;

import java.time.Instant;

public record SocietyCandidateResponse(String slug, String name, String localitySlug, String mintOrigin, Instant createdAt) {
}
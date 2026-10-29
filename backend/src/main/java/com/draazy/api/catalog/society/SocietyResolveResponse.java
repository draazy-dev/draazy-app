package com.draazy.api.catalog.society;

import java.util.List;

public record SocietyResolveResponse(SocietyResponse society, List<SocietyResponse> candidates) {
}

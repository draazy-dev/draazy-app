package com.draazy.api.engagement.saved;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SavedKey(String id, String slug) {
}

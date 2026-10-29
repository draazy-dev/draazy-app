package com.draazy.api.catalog.society;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SocietyHome(UUID id, String slug, String title, String deal, BigDecimal bhk, Long price, BigDecimal area) {
}
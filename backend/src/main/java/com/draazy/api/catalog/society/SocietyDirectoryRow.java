package com.draazy.api.catalog.society;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SocietyDirectoryRow(
        String slug,
        String name,
        String builder,
        String localitySlug,
        Integer year,
        BigDecimal maintenancePerSqft) {
    static SocietyDirectoryRow of(Society society) {
        return new SocietyDirectoryRow(society.getSlug(), society.getName(), society.getBuilder(),
                society.getLocalitySlug(), society.getYear(), society.getMaintenancePerSqft());
    }
}

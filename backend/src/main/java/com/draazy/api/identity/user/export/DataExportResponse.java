package com.draazy.api.identity.user.export;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record DataExportResponse(
        Instant generatedAt,
        UUID subjectId,
        int schemaVersion,
        String redactionRule,
        int rowLimit,
        List<Dataset> datasets,
        List<Exclusion> excluded) {
    public static final int SCHEMA_VERSION = 1;

    public record Dataset(
            String domain,
            String name,
            String describes,
            int rowCount,
            boolean truncated,
            Map<String, String> withheld,
            List<Map<String, Object>> rows) {
    }

    public record Exclusion(String name, String reason) {
    }
}

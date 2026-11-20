package com.draazy.api.identity.user.export;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DataExportService {
    private final NamedParameterJdbcTemplate jdbc;
    private final UserRepository users;
    private final int rowLimit;

    DataExportService(NamedParameterJdbcTemplate jdbc, UserRepository users,
            @Value("${draazy.export.row-limit:200}") int rowLimit) {
        this.jdbc = jdbc;
        this.users = users;
        this.rowLimit = rowLimit;
    }

    @Transactional(readOnly = true)
    public DataExportResponse exportFor(UUID subjectId) {
        User subject = users.findById(subjectId)
                .orElseThrow(() -> NotFoundException.of("User"));

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("subjectId", subjectId)
                .addValue("subjectIdText", subjectId.toString())
                .addValue("subjectMobile", subject.getMobile());

        List<DataExportResponse.Dataset> datasets = new ArrayList<>();
        for (DataExportScope.Dataset dataset : DataExportScope.all()) {
            datasets.add(read(dataset, params, subjectId));
        }

        return new DataExportResponse(
                Instant.now(),
                subjectId,
                DataExportResponse.SCHEMA_VERSION,
                DataExportScope.redactionRule(),
                rowLimit,
                List.copyOf(datasets),
                DataExportScope.exclusions().stream()
                        .map(e -> new DataExportResponse.Exclusion(e.name(), e.reason()))
                        .toList());
    }

    private DataExportResponse.Dataset read(DataExportScope.Dataset dataset,
            MapSqlParameterSource params, UUID subjectId) {
        String sql = "select * from (\n" + dataset.sql() + "\n) as d limit " + (rowLimit + 1);

        List<Map<String, Object>> raw = jdbc.queryForList(sql, params);
        boolean truncated = raw.size() > rowLimit;
        if (truncated) {
            raw = raw.subList(0, rowLimit);
        }

        List<Map<String, Object>> rows = raw.stream()
                .map(row -> DataExportRedaction.row(row, subjectId))
                .toList();

        return new DataExportResponse.Dataset(
                dataset.domain(),
                dataset.name(),
                dataset.describes(),
                rows.size(),
                truncated,
                dataset.withheld(),
                rows);
    }
}

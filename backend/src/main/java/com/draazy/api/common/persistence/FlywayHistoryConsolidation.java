package com.draazy.api.common.persistence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationVersion;
import org.flywaydb.core.api.configuration.Configuration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;

/** An old-chain database already has the consolidated schema, so its history is rewritten rather than rebuilt. */
@org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
public class FlywayHistoryConsolidation {
    private static final Logger log = LoggerFactory.getLogger(FlywayHistoryConsolidation.class);

    static final MigrationVersion OLD_CHAIN_MAX = MigrationVersion.fromVersion("26.11.44");

    // SHA-256 of "version,checksum\n" for every pre-consolidation row in version order.
    static final String OLD_CHAIN_DIGEST = "fd79f20c949a2d300b13961c3e8bca1666cbd70e7158a22c9cdec68438f8c9c7";

    @Bean
    FlywayMigrationStrategy consolidatingMigrationStrategy() {
        return flyway -> {
            consolidate(flyway);
            flyway.migrate();
        };
    }

    static void consolidate(Flyway flyway) {
        Configuration config = flyway.getConfiguration();
        try (Connection connection = config.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try {
                swapIfOldChain(connection, config);
                connection.commit();
            } catch (SQLException | RuntimeException e) {
                connection.rollback();
                throw e;
            }
        } catch (SQLException e) {
            throw new IllegalStateException("Could not check the schema history for the 26.11 consolidation", e);
        }
    }

    private static void swapIfOldChain(Connection connection, Configuration config) throws SQLException {
        String table = historyTable(connection, config);
        if (table == null) {
            return;
        }
        List<MigrationInfo> consolidated = consolidatedMigrations(config);
        try (Statement lock = connection.createStatement()) {
            lock.execute("LOCK TABLE " + table + " IN ACCESS EXCLUSIVE MODE");
        }
        List<Row> covered = coveredRows(connection, table);
        Set<String> consolidatedVersions = consolidated.stream()
                .map(m -> m.getVersion().getVersion()).collect(Collectors.toSet());
        if (covered.stream().allMatch(r -> r.success() && consolidatedVersions.contains(r.version()))) {
            return;
        }
        if (!OLD_CHAIN_DIGEST.equals(digest(covered))) {
            throw new IllegalStateException("The schema history of " + table + " predates the 26.11 migration "
                    + "consolidation but is not the complete old chain (26.10.01 to 26.11.44). Its migration files "
                    + "no longer exist, so drop and recreate this database.");
        }
        rewrite(connection, table, covered, consolidated);
        log.info("Swapped {} pre-consolidation history rows in {} for {} consolidated migrations",
                covered.size(), table, consolidated.size());
    }

    private static String historyTable(Connection connection, Configuration config) throws SQLException {
        String schema = config.getDefaultSchema() != null ? config.getDefaultSchema()
                : config.getSchemas().length > 0 ? config.getSchemas()[0] : null;
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT to_regclass(quote_ident(coalesce(?, current_schema())) || '.' || quote_ident(?))::text")) {
            statement.setString(1, schema);
            statement.setString(2, config.getTable());
            try (ResultSet rs = statement.executeQuery()) {
                rs.next();
                return rs.getString(1);
            }
        }
    }

    private static List<Row> coveredRows(Connection connection, String table) throws SQLException {
        List<Row> rows = new ArrayList<>();
        try (Statement statement = connection.createStatement();
                ResultSet rs = statement.executeQuery(
                        "SELECT version, checksum, success FROM " + table + " WHERE version IS NOT NULL")) {
            while (rs.next()) {
                Row row = new Row(rs.getString(1), (Integer) rs.getObject(2), rs.getBoolean(3));
                if (MigrationVersion.fromVersion(row.version()).compareTo(OLD_CHAIN_MAX) <= 0) {
                    rows.add(row);
                }
            }
        }
        rows.sort(Comparator.comparing(r -> MigrationVersion.fromVersion(r.version())));
        return rows;
    }

    // A history table that cannot exist yet lists every resolved migration as pending, with its file checksum.
    private static List<MigrationInfo> consolidatedMigrations(Configuration config) {
        Flyway probe = Flyway.configure(config.getClassLoader()).configuration(config)
                .table(config.getTable() + "_consolidation_probe").load();
        return Arrays.stream(probe.info().pending())
                .filter(m -> m.getVersion() != null && m.getVersion().compareTo(OLD_CHAIN_MAX) <= 0)
                .toList();
    }

    static String digest(List<Row> rows) {
        String lines = rows.stream()
                .map(r -> r.version() + "," + r.checksum() + (r.success() ? "" : ",failed") + "\n")
                .collect(Collectors.joining());
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(lines.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    // Consolidated rows take the first ranks; every other row keeps its relative order, so the latest run of each
    // repeatable migration is still the one Flyway compares against.
    private static void rewrite(Connection connection, String table, List<Row> covered,
            List<MigrationInfo> consolidated) throws SQLException {
        Array replaced = connection.createArrayOf("text", covered.stream().map(Row::version).toArray());
        try (PreparedStatement keep = connection.prepareStatement(
                "CREATE TEMP TABLE flyway_history_keep ON COMMIT DROP AS SELECT * FROM " + table
                        + " WHERE version IS NULL OR NOT version = ANY (?)")) {
            keep.setArray(1, replaced);
            keep.execute();
        }
        try (Statement statement = connection.createStatement()) {
            statement.execute("DELETE FROM " + table);
        }
        String columns = "installed_rank, version, description, type, script, checksum, installed_by, installed_on, "
                + "execution_time, success";
        try (PreparedStatement insert = connection.prepareStatement("INSERT INTO " + table + " (" + columns
                + ") VALUES (?, ?, ?, ?, ?, ?, current_user, now(), 0, true)")) {
            int rank = 0;
            for (MigrationInfo m : consolidated) {
                insert.setInt(1, ++rank);
                insert.setString(2, m.getVersion().getVersion());
                insert.setString(3, m.getDescription());
                insert.setString(4, m.getType().name());
                insert.setString(5, m.getScript());
                insert.setObject(6, m.getChecksum());
                insert.addBatch();
            }
            insert.executeBatch();
        }
        try (PreparedStatement rest = connection.prepareStatement("INSERT INTO " + table + " (" + columns
                + ") SELECT ? + row_number() OVER (ORDER BY installed_rank), version, description, type, script, "
                + "checksum, installed_by, installed_on, execution_time, success FROM flyway_history_keep")) {
            rest.setInt(1, consolidated.size());
            rest.execute();
        }
    }

    record Row(String version, Integer checksum, boolean success) {}
}

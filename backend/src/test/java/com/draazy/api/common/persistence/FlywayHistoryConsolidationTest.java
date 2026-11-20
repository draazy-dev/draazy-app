package com.draazy.api.common.persistence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Flyway history consolidation — old-chain databases keep their schema")
class FlywayHistoryConsolidationTest {
    private static final String URL =
            System.getenv().getOrDefault("TEST_DB_URL", "jdbc:postgresql://localhost:5432/draazy_test");
    private static final String USER = System.getenv().getOrDefault("TEST_DB_USER", "postgres");
    private static final String PASSWORD = System.getenv().getOrDefault("TEST_DB_PASSWORD", "postgres");

    private final String schema = "history_swap_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    private Flyway flyway;

    @BeforeEach
    void createSchema() throws SQLException {
        sql("CREATE SCHEMA " + schema);
        flyway = Flyway.configure().dataSource(URL, USER, PASSWORD).schemas(schema).defaultSchema(schema)
                .locations("classpath:db/migration").sqlMigrationPrefix("").ignoreMigrationPatterns("*:pending")
                .load();
    }

    @AfterEach
    void dropSchema() throws SQLException {
        sql("DROP SCHEMA " + schema + " CASCADE");
    }

    @Test
    @DisplayName("a fresh database is left alone")
    void freshDatabaseIsUntouched() throws SQLException {
        FlywayHistoryConsolidation.consolidate(flyway);

        assertThat(single("SELECT to_regclass('" + schema + ".flyway_schema_history')::text")).isNull();
    }

    @Test
    @DisplayName("the complete old chain becomes the consolidated chain, and the result validates")
    void oldChainIsSwapped() throws Exception {
        seedHistory(oldChain());

        FlywayHistoryConsolidation.consolidate(flyway);

        assertThat(versionedRows()).isEqualTo(consolidatedFiles());
        assertThat(versionedRows()).noneMatch(r -> r.startsWith("26.10."));
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
    }

    @Test
    @DisplayName("repeatable and later rows survive the swap, in their old order after the consolidated rows")
    void otherRowsAreKept() throws Exception {
        List<String[]> rows = oldChain();
        rows.add(40, new String[] {null, "111"});
        rows.add(new String[] {"26.12.99", "222"});
        rows.add(new String[] {null, "333"});
        seedHistory(rows);

        FlywayHistoryConsolidation.consolidate(flyway);

        int consolidated = consolidatedFiles().size();
        assertThat(list("SELECT installed_rank || ':' || coalesce(version, 'R') || ':' || checksum FROM " + schema
                + ".flyway_schema_history WHERE installed_rank > " + consolidated + " ORDER BY installed_rank"))
                .containsExactly((consolidated + 1) + ":R:111", (consolidated + 2) + ":26.12.99:222",
                        (consolidated + 3) + ":R:333");
    }

    @Test
    @DisplayName("running again on a consolidated history changes nothing")
    void secondRunIsANoOp() throws Exception {
        seedHistory(oldChain());
        FlywayHistoryConsolidation.consolidate(flyway);
        List<String> after = list("SELECT installed_rank || ':' || coalesce(version, 'R') || ':' || checksum || ':'"
                + " || installed_on FROM " + schema + ".flyway_schema_history ORDER BY installed_rank");

        FlywayHistoryConsolidation.consolidate(flyway);

        assertThat(list("SELECT installed_rank || ':' || coalesce(version, 'R') || ':' || checksum || ':'"
                + " || installed_on FROM " + schema + ".flyway_schema_history ORDER BY installed_rank"))
                .isEqualTo(after);
    }

    @Test
    @DisplayName("an old chain that stopped short is refused with a rebuild instruction")
    void partialOldChainFails() throws Exception {
        List<String[]> rows = oldChain();
        seedHistory(rows.subList(0, rows.size() - 13));

        assertThatThrownBy(() -> FlywayHistoryConsolidation.consolidate(flyway))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("drop and recreate");
    }

    @Test
    @DisplayName("an old chain with a failed row is refused, not papered over")
    void failedOldRowFails() throws Exception {
        seedHistory(oldChain());
        sql("UPDATE " + schema + ".flyway_schema_history SET success = false WHERE version = '26.11.44'");

        assertThatThrownBy(() -> FlywayHistoryConsolidation.consolidate(flyway))
                .isInstanceOf(IllegalStateException.class);
        assertThat(single("SELECT count(*) FROM " + schema + ".flyway_schema_history")).isEqualTo("84");
    }

    private static List<String[]> oldChain() throws IOException {
        try (InputStream in = FlywayHistoryConsolidationTest.class
                .getResourceAsStream("/db-consolidation/pre-26.11-chain.csv")) {
            List<String[]> rows = new ArrayList<>();
            new String(in.readAllBytes(), StandardCharsets.UTF_8).lines().map(l -> l.split(",")).forEach(rows::add);
            return rows;
        }
    }

    private List<String> consolidatedFiles() {
        Flyway probe = Flyway.configure().dataSource(URL, USER, PASSWORD).schemas(schema).defaultSchema(schema)
                .table("no_such_history").locations("classpath:db/migration").sqlMigrationPrefix("").load();
        return Arrays.stream(probe.info().pending())
                .filter(m -> m.getVersion() != null
                        && m.getVersion().compareTo(MigrationVersion.fromVersion("26.11.44")) <= 0)
                .map(m -> m.getVersion().getVersion() + ":" + m.getChecksum())
                .toList();
    }

    private List<String> versionedRows() throws SQLException {
        return list("SELECT version || ':' || checksum FROM " + schema + ".flyway_schema_history"
                + " WHERE version IS NOT NULL AND string_to_array(version, '.')::int[] <= '{26,11,44}'"
                + " ORDER BY installed_rank");
    }

    private void seedHistory(List<String[]> rows) throws SQLException {
        sql("CREATE TABLE " + schema + ".flyway_schema_history (LIKE public.flyway_schema_history INCLUDING ALL)");
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD);
                PreparedStatement insert = c.prepareStatement("INSERT INTO " + schema + ".flyway_schema_history"
                        + " (installed_rank, version, description, type, script, checksum, installed_by,"
                        + " execution_time, success) VALUES (?, ?, 'x', 'SQL', ?, ?, 'postgres', 0, true)")) {
            int rank = 0;
            for (String[] row : rows) {
                insert.setInt(1, ++rank);
                insert.setString(2, row[0]);
                insert.setString(3, row[0] == null ? "R__x.sql" : row[0] + "__x.sql");
                insert.setInt(4, Integer.parseInt(row[1]));
                insert.addBatch();
            }
            insert.executeBatch();
        }
    }

    private static void sql(String statement) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD); Statement s = c.createStatement()) {
            s.execute(statement);
        }
    }

    private static String single(String query) throws SQLException {
        List<String> values = list(query);
        return values.isEmpty() ? null : values.getFirst();
    }

    private static List<String> list(String query) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD);
                Statement s = c.createStatement();
                ResultSet rs = s.executeQuery(query)) {
            List<String> values = new ArrayList<>();
            while (rs.next()) {
                values.add(rs.getString(1));
            }
            return values;
        }
    }
}

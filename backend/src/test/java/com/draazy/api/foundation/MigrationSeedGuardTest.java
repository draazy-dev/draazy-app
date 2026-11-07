package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Migrations — reference data never ships in a versioned file")
class MigrationSeedGuardTest {
    private static final Path MIGRATIONS = Path.of("src/main/resources/db/migration");

    private static final Path REFERENCE_SEED = MIGRATIONS.resolve("R__DML_seed_reference_data.sql");

    private static final Map<String, String> BACKFILLS = Map.of(
            "26.10.36",
            "Inserts one timeline row per held draft it releases; a reset database has no held drafts to release.",
            "26.10.52",
            "Copies retired per-post lifestyle tags into user_living_style; a reset database has no posts to copy from.",
            "26.11.10",
            "Rebuilds per-day viewer rows from past view signals; a reset database has no signals to rebuild from.",
            "26.11.30",
            "Moves tenant groups that already have a flat into rooms; a reset database has no groups to move.",
            "26.11.32",
            "Moves owner groups that already have a flat into rooms; a reset database has no groups to move.",
            "26.10.67",
            "Inserts the retired untyped pack only so pre-split pack subscriptions can move onto it; a reset "
                    + "database has no subscriptions to move, and the R__ seed restores the row.",
            "26.11.36",
            "Folds pre-chat ticket, review and request threads into one support chat per user; no seed "
                    + "writes those threads, so a reset database has none to fold.",
            "26.11.37",
            "Indexes the same pre-chat threads per subject; a reset database has none to index.");

    private static final Map<String, String> RE_HOMED_INTO_REFERENCE_SEED = Map.of(
            "message_template",
            "A versioned migration once created this table and seeded its ten WhatsApp templates in the same "
                    + "file, so the live reset destroyed them on every machine and GET /admin/message-templates "
                    + "answered [] for months. The rows now live in R__DML_seed_reference_data.sql with "
                    + "ON CONFLICT (id) DO UPDATE.");

    private static final Pattern INSERT = Pattern.compile("insert\\s+into\\s+([\\w.\"]+)", Pattern.CASE_INSENSITIVE);

    private static final Pattern VERSION = Pattern.compile("^(\\d+(?:\\.\\d+)*)__");

    @Test
    @DisplayName("a versioned migration that seeds reference data is a silent data-loss bug")
    void versionedMigrationsDoNotSeedReferenceData() {
        Map<String, List<String>> offenders = new TreeMap<>();

        for (Path migration : versionedMigrations()) {
            if (BACKFILLS.containsKey(version(migration))) {
                continue;
            }
            List<String> tables = insertedTables(read(migration));
            if (!tables.isEmpty()) {
                offenders.put(migration.getFileName().toString(), tables);
            }
        }

        assertThat(offenders)
                .as(
                        """
                        These versioned migrations insert rows. The live reset truncates every table and \
                        replays only the R__ seeds, and flyway_schema_history survives it -- so a versioned \
                        migration's rows are deleted by the first live run and never restored, on any \
                        machine, silently.

                        If these rows are reference data (the application expects them to exist on every \
                        environment): they belong in R__DML_seed_reference_data.sql with ON CONFLICT (id) DO \
                        UPDATE, and the table belongs in RE_HOMED_INTO_REFERENCE_SEED. Do not edit the \
                        versioned migration if it has been applied anywhere -- that changes its checksum \
                        and fails Flyway validation on the next start; write the seed and leave the \
                        migration alone.

                        If they are a one-time backfill: add the version to BACKFILLS with a sentence \
                        saying why losing them to the reset costs nothing.""")
                .isEmpty();
    }

    @Test
    @DisplayName("a table listed as re-homed still has its rows in the repeatable seed")
    void reHomedTablesAreStillSeeded() {
        List<String> seeded = insertedTables(read(REFERENCE_SEED));

        for (Map.Entry<String, String> entry : RE_HOMED_INTO_REFERENCE_SEED.entrySet()) {
            assertThat(seeded)
                    .as(
                            "%s is listed as re-homed, but nothing in R__DML_seed_reference_data.sql inserts "
                                    + "into it. The live reset truncates every table and replays only the R__ "
                                    + "seeds, so it is empty on every machine that has run the live suite once.%n%s",
                            entry.getKey(), entry.getValue())
                    .contains(entry.getKey());
        }
    }

    @Test
    @DisplayName("every listed version still exists and still inserts")
    void theListsDoNotRot() {
        Set<String> present = versionedMigrations().stream()
                .filter(m -> !insertedTables(read(m)).isEmpty())
                .map(MigrationSeedGuardTest::version)
                .collect(java.util.stream.Collectors.toSet());

        assertThat(present)
                .as("a listed migration was deleted or no longer inserts -- drop it from BACKFILLS")
                .containsAll(BACKFILLS.keySet());

        assertThat(present.stream().filter(v -> !BACKFILLS.containsKey(v)).toList())
                .as("the consolidated chain is DDL-only -- a versioned migration that inserts rows "
                        + "either belongs in an R__DML_ seed or needs a BACKFILLS entry explaining itself")
                .isEmpty();
    }

    private static List<Path> versionedMigrations() {
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            return files.filter(p -> VERSION.matcher(p.getFileName().toString()).find())
                    .sorted()
                    .toList();
        } catch (IOException e) {
            throw new UncheckedIOException(
                    "Could not read " + MIGRATIONS.toAbsolutePath() + " -- has the migration folder moved?", e);
        }
    }

    private static String version(Path migration) {
        Matcher m = VERSION.matcher(migration.getFileName().toString());
        return m.find() ? m.group(1) : migration.getFileName().toString();
    }

    private static List<String> insertedTables(String sql) {
        Matcher m = INSERT.matcher(stripFunctionBodies(stripComments(sql)));
        return m.results().map(r -> r.group(1)).distinct().toList();
    }

    private static String stripFunctionBodies(String sql) {
        return sql.replaceAll("(?is)(create\\s+(?:or\\s+replace\\s+)?function\\b.*?)\\$(\\w*)\\$.*?\\$\\2\\$", "$1");
    }

    private static String stripComments(String sql) {
        return sql.replaceAll("(?s)/\\*.*?\\*/", " ").replaceAll("--[^\\n]*", " ");
    }

    private static String read(Path migration) {
        try {
            return Files.readString(migration);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read " + migration, e);
        }
    }
}

package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Migrations — the chain stays replayable")
class MigrationChainTest {
    private static final Path MIGRATIONS =
            Path.of("src", "main", "resources", "db", "migration").toAbsolutePath();

    private static final Pattern CREATE_TABLE = Pattern.compile(
            "(?im)^\\s*CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:public\\.)?([a-z_][a-z0-9_]*)");

    private static final Pattern DROP_TABLE = Pattern.compile(
            "(?im)^\\s*DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?([a-z_][a-z0-9_]*)");

    private static final Pattern VERSIONED = Pattern.compile("^(\\d+(?:\\.\\d+)*)__");

    private static final Pattern NAMED = Pattern.compile("^\\d{2}\\.(0[1-9]|1[0-2])\\.\\d{2}__[a-z0-9_]+\\.sql$",
            Pattern.CASE_INSENSITIVE);

    private static Stream<Path> sqlFiles() {
        try {
            return Files.list(MIGRATIONS).filter(p -> p.toString().endsWith(".sql"));
        } catch (IOException e) {
            throw new UncheckedIOException("cannot read " + MIGRATIONS, e);
        }
    }

    private static String read(Path p) {
        try {
            return Files.readString(p, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("cannot read " + p, e);
        }
    }

    private static String withoutComments(String sql) {
        return sql.replaceAll("(?m)--.*$", "");
    }

    @Test
    @DisplayName("no table is created twice in the chain")
    void noTableIsCreatedTwice() {
        Map<String, String> liveCreator = new TreeMap<>();
        Map<String, List<String>> duplicated = new TreeMap<>();
        sqlFiles().sorted().forEach(file -> {
            String name = file.getFileName().toString();
            String sql = withoutComments(read(file));
            new TreeMap<>(statementsInOrder(sql)).forEach((position, statement) -> {
                String table = statement.table();
                if (statement.drop()) {
                    liveCreator.remove(table);
                } else if (liveCreator.containsKey(table)) {
                    duplicated.computeIfAbsent(table,
                            k -> new java.util.ArrayList<>(List.of(liveCreator.get(k)))).add(name);
                } else {
                    liveCreator.put(table, name);
                }
            });
        });

        assertThat(duplicated)
                .as("each of these tables is created by more than one migration, with no DROP in "
                        + "between. A database that grew incrementally survives it; one built from "
                        + "scratch fails on the second CREATE with 'relation already exists'. Keep "
                        + "the later, considered definition and delete the earlier sketch — and "
                        + "note that doing so edits an applied migration, so every existing "
                        + "database has to be rebuilt. If the rebuild is deliberate, drop the table "
                        + "first in the later migration instead of editing the earlier one")
                .isEmpty();
    }

    private record TableStatement(String table, boolean drop) {}

    private static Map<Integer, TableStatement> statementsInOrder(String sql) {
        Map<Integer, TableStatement> found = new TreeMap<>();
        Matcher creates = CREATE_TABLE.matcher(sql);
        while (creates.find()) {
            found.put(creates.start(), new TableStatement(lower(creates.group(1)), false));
        }
        Matcher drops = DROP_TABLE.matcher(sql);
        while (drops.find()) {
            found.put(drops.start(), new TableStatement(lower(drops.group(1)), true));
        }
        return found;
    }

    private static String lower(String value) {
        return value.toLowerCase(java.util.Locale.ROOT);
    }

    @Test
    @DisplayName("no two migrations claim the same version")
    void versionsAreUnique() {
        Map<String, List<String>> byVersion = new TreeMap<>();
        sqlFiles().forEach(file -> {
            String name = file.getFileName().toString();
            Matcher m = VERSIONED.matcher(name);
            if (m.find()) {
                String version = Stream.of(m.group(1).split("\\."))
                        .map(part -> String.valueOf(Integer.parseInt(part)))
                        .collect(java.util.stream.Collectors.joining("."));
                byVersion.computeIfAbsent(version, k -> new java.util.ArrayList<>()).add(name);
            }
        });

        Map<String, List<String>> clashes = new TreeMap<>();
        byVersion.forEach((version, files) -> {
            if (files.size() > 1) {
                clashes.put(version, files);
            }
        });

        assertThat(clashes)
                .as("two migrations share a version number — renumber the later one")
                .isEmpty();
    }

    @Test
    @DisplayName("every file is a <yy>.<mm>.<seq>__ versioned migration or an R__ repeatable")
    void filesFollowTheNamingConvention() {
        assertThat(sqlFiles().map(p -> p.getFileName().toString())
                        .filter(name -> !name.startsWith("R__") && !NAMED.matcher(name).matches()))
                .as("name versioned migrations <yy>.<mm>.<seq>__<description>.sql, e.g. 26.10.01__create_table.sql; "
                        + "the sequence restarts at 01 each month. Flyway runs with an empty versioned "
                        + "prefix, so any other name is either ignored or read as a version")
                .isEmpty();
    }
}

package com.draazy.api.foundation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/** Source-level proof that request values reach SQL only as bind parameters, never as statement text. */
@DisplayName("Architecture — SQL is built from constants; LIKE input is escaped")
class SqlConstructionGuardTest {

    private static final Path MAIN = Path.of("src", "main", "java");

    private static final Pattern QUERY_CALL = Pattern.compile(
            "\\.(createNativeQuery|createQuery)\\s*\\("
                    + "|\\bjdbc\\s*\\.\\s*(query|queryForObject|queryForList|queryForMap|queryForStream"
                    + "|update|batchUpdate|execute)\\s*\\(");

    private static final Pattern NON_CODE = Pattern.compile(
            "\"\"\"[\\s\\S]*?\"\"\"|\"(?:\\\\.|[^\"\\\\])*\"|//[^\\n]*|/\\*[\\s\\S]*?\\*/");

    private static final Pattern CONSTANTS_ONLY = Pattern.compile("[\\s+]*(?:(?:\\w+\\.)?[A-Z][A-Z0-9_]*[\\s+]*)*");

    private static final Pattern WILDCARD_CONCAT = Pattern.compile("\"%\"\\s*\\+|\\+\\s*\"%\"|concat\\('%'");

    private static final Pattern ESCAPED = Pattern.compile("LikePatterns|(?i:escape)|replace\\(\"%\"");

    /** Reviewed: each builds its statement only from constants or literals it chooses itself, and binds every value. */
    private static final Map<String, String> REVIEWED_DYNAMIC_SQL = Map.ofEntries(
            Map.entry("admin/AdminHelpFeedbackService.java", "optional ' AND slug = ?' literal"),
            Map.entry("admin/AdminIntegrationsService.java", "WHERE clause of fixed ' AND col = ?' literals"),
            Map.entry("admin/AdminMetricsRepository.java", "filters are literals; IST is a constant"),
            Map.entry("admin/AdminSlaService.java", "TRACK formatted with *_COMPLETED/*_OUTSTANDING constants"),
            Map.entry("admin/staff/TeamPerformanceRepository.java", "team names come from DESK_TEAMS, not the caller"),
            Map.entry("catalog/property/PropertyCountsService.java", "JPA CriteriaQuery"),
            Map.entry("catalog/property/PropertySearchFragmentImpl.java", "JPA CriteriaQuery"),
            Map.entry("common/persistence/RateLimitLock.java", "both callers pass a literal"),
            Map.entry("engagement/flatmate/FlatmateSearchQueries.java", "sort and score fragments are literals"),
            Map.entry("engagement/search/SavedSearchMatcher.java", "stored criteria are bound, never inlined"),
            Map.entry("identity/user/export/DataExportService.java", "DataExportScope constants plus an int limit"),
            Map.entry("moderation/enquiry/EnquiryBoardQueries.java", "entity names are literals at every call site"),
            Map.entry("moderation/property/PendingQueue.java", "ROWS formatted with literal asc/desc"),
            Map.entry("moderation/verification/NeedsInfoReviewRepository.java", "every caller passes a text block"));

    /** Reviewed: the input cannot carry a wildcard. */
    private static final Map<String, String> REVIEWED_UNESCAPED_LIKE = Map.of(
            "catalog/locality/LocalityRepository.java", "LocalityPlaceService.search strips % _ and \\ first",
            "identity/verification/IdentityReviewQueueService.java", "the mobile term is digits only");

    @Test
    @DisplayName("query text is literals and constants, or a reviewed builder")
    void queryTextIsConstant() {
        TreeSet<String> dynamic = new TreeSet<>();
        for (Path file : sources()) {
            String source = read(file);
            Matcher call = QUERY_CALL.matcher(source);
            while (call.find()) {
                String argument = firstArgument(source, call.end());
                if (!CONSTANTS_ONLY.matcher(NON_CODE.matcher(argument).replaceAll("")).matches()) {
                    dynamic.add(key(file));
                }
            }
        }
        assertThat(dynamic)
                .as("""
                        A query is built from something other than literals and constants. Bind every \
                        request value as a parameter; choose sort columns and fragments from a fixed \
                        switch. Once reviewed, add the file to REVIEWED_DYNAMIC_SQL with the reason.""")
                .isSubsetOf(REVIEWED_DYNAMIC_SQL.keySet());
        assertThat(REVIEWED_DYNAMIC_SQL.keySet()).as("stale entries — remove them").isSubsetOf(dynamic);
    }

    @Test
    @DisplayName("a % pattern around input escapes the input's own wildcards")
    void likeInputIsEscaped() {
        List<String> unescaped = new ArrayList<>();
        for (Path file : sources()) {
            if (REVIEWED_UNESCAPED_LIKE.containsKey(key(file))) {
                continue;
            }
            List<String> lines = read(file).lines().toList();
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i);
                if (WILDCARD_CONCAT.matcher(line).find() && !ESCAPED.matcher(line).find()) {
                    unescaped.add(key(file) + ":" + (i + 1) + "  " + line.strip());
                }
            }
        }
        assertThat(unescaped)
                .as("Build the pattern with LikePatterns.contains(q) or LikePatterns.escape(term)")
                .isEmpty();
    }

    @Test
    @DisplayName("the guard's argument scanner sees through literals, nesting and text blocks")
    void scannerReadsTheFirstArgument() {
        String source = "em.createNativeQuery(// it's (\n\"a, (b\" + SQL + \"\"\"\n ) , \n\"\"\", X.class)";
        String argument = firstArgument(source, source.indexOf('(') + 1);

        assertThat(argument).isEqualTo("// it's (\n\"a, (b\" + SQL + \"\"\"\n ) , \n\"\"\"");
        assertThat(CONSTANTS_ONLY.matcher(NON_CODE.matcher(argument).replaceAll("")).matches()).isTrue();
        assertThat(CONSTANTS_ONLY.matcher(NON_CODE.matcher("\"a\" + where").replaceAll("")).matches())
                .isFalse();
    }

    private static String firstArgument(String source, int start) {
        int depth = 0;
        int i = start;
        while (i < source.length()) {
            if (source.startsWith("\"\"\"", i)) {
                i = source.indexOf("\"\"\"", i + 3) + 3;
                continue;
            }
            if (source.startsWith("//", i) || source.startsWith("/*", i)) {
                i = source.indexOf(source.charAt(i + 1) == '/' ? "\n" : "*/", i + 2) + 1;
                continue;
            }
            char c = source.charAt(i);
            if (c == '"' || c == '\'') {
                i = closingQuote(source, i, c);
            } else if (c == '(') {
                depth++;
            } else if (c == ')' && depth-- == 0 || c == ',' && depth == 0) {
                break;
            }
            i++;
        }
        return source.substring(start, i).strip();
    }

    private static int closingQuote(String source, int open, char quote) {
        int i = open + 1;
        while (source.charAt(i) != quote) {
            i += source.charAt(i) == '\\' ? 2 : 1;
        }
        return i;
    }

    private static List<Path> sources() {
        try (Stream<Path> files = Files.walk(MAIN)) {
            return files.filter(p -> p.toString().endsWith(".java")).sorted().toList();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String key(Path file) {
        return MAIN.resolve("com/draazy/api").relativize(file).toString().replace('\\', '/');
    }
}

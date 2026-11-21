package com.draazy.api.admin;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.web.PageResponse;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.function.Function;
import java.util.regex.Pattern;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AdminHelpFeedbackService {
    private static final Pattern SLUG = Pattern.compile("[a-z0-9-]{1,120}");
    private static final int MAX_PAGE = 100;
    private static final int MIN_VOTES = 5;

    private static final String SINCE_FILTER =
            "(cast(:since as timestamptz) IS NULL OR created_at >= cast(:since as timestamptz))";

    private static final String COUNT_ARTICLES = "SELECT count(*) FROM (SELECT 1 FROM help_article_feedback WHERE "
            + SINCE_FILTER + " GROUP BY slug, lang) g";

    private static final String ARTICLES = """
            SELECT slug, lang,
                   count(*) FILTER (WHERE helpful),
                   count(*) FILTER (WHERE NOT helpful),
                   count(comment),
                   max(created_at)
            FROM help_article_feedback
            WHERE\s""" + SINCE_FILTER + """

            GROUP BY slug, lang
            ORDER BY (count(*) >= :minVotes) DESC,
                     count(*) FILTER (WHERE NOT helpful)::numeric / count(*) DESC,
                     count(*) DESC, slug, lang
            LIMIT :limit OFFSET :offset""";

    private static final String COMMENT_FILTER = " WHERE comment IS NOT NULL"
            + " AND (cast(:slug as text) IS NULL OR slug = cast(:slug as text)) AND " + SINCE_FILTER;

    private static final String COUNT_COMMENTS = "SELECT count(*) FROM help_article_feedback" + COMMENT_FILTER;

    private static final String COMMENTS =
            "SELECT id, slug, lang, helpful, comment, created_at FROM help_article_feedback" + COMMENT_FILTER
                    + " ORDER BY created_at DESC, id LIMIT :limit OFFSET :offset";

    private final NamedParameterJdbcTemplate jdbc;

    public AdminHelpFeedbackService(JdbcTemplate jdbc) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
    }

    public PageResponse<AdminHelpFeedbackArticle> articles(Integer days, int page, int size) {
        int safeSize = Math.clamp(size, 1, MAX_PAGE);
        int safePage = Math.max(page, 0);
        MapSqlParameterSource params = new MapSqlParameterSource("since", sinceBound(days));
        Long total = jdbc.queryForObject(COUNT_ARTICLES, params, Long.class);
        params.addValue("minVotes", MIN_VOTES)
                .addValue("limit", safeSize)
                .addValue("offset", (long) safePage * safeSize);
        List<AdminHelpFeedbackArticle> rows = jdbc.query(ARTICLES, params,
                (rs, n) -> new AdminHelpFeedbackArticle(rs.getString(1), rs.getString(2),
                        rs.getLong(3), rs.getLong(4), rs.getLong(5), instant(rs, 6)));
        return page(rows, safePage, safeSize, total);
    }

    public PageResponse<AdminHelpFeedbackComment> comments(String slug, Integer days, int page, int size) {
        if (slug != null && !SLUG.matcher(slug).matches()) {
            throw new BadRequestException("slug must be lower-case letters, digits and hyphens");
        }
        int safeSize = Math.clamp(size, 1, MAX_PAGE);
        int safePage = Math.max(page, 0);
        MapSqlParameterSource params = new MapSqlParameterSource("slug", slug)
                .addValue("since", sinceBound(days));
        Long total = jdbc.queryForObject(COUNT_COMMENTS, params, Long.class);
        params.addValue("limit", safeSize).addValue("offset", (long) safePage * safeSize);
        List<AdminHelpFeedbackComment> rows = jdbc.query(COMMENTS, params,
                (rs, n) -> new AdminHelpFeedbackComment(rs.getObject(1, UUID.class), rs.getString(2),
                        rs.getString(3), rs.getBoolean(4), rs.getString(5), instant(rs, 6)));
        return page(rows, safePage, safeSize, total);
    }

    private static Timestamp sinceBound(Integer days) {
        Instant since = PlatformTime.sinceOrNull(days);
        return since == null ? null : Timestamp.from(since);
    }

    private static <T> PageResponse<T> page(List<T> rows, int page, int size, Long total) {
        return PageResponse.of(new PageImpl<>(rows, PageRequest.of(page, size), total == null ? 0 : total),
                Function.identity());
    }

    private static Instant instant(ResultSet rs, int column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }
}

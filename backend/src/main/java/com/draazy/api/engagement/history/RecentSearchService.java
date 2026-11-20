package com.draazy.api.engagement.history;

import com.draazy.api.common.error.ValidationException;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecentSearchService {
    static final int MAX_ENTRIES = 6;

    private static final Set<String> ALLOWED_PATHS = Set.of("/listings", "/flatmates");

    private static final Pattern SAFE_CHARS = Pattern.compile("^[A-Za-z0-9\\-._~%!$&'()*+,;=:@/?]*$");

    private final RecentSearchRepository searches;

    public RecentSearchService(RecentSearchRepository searches) {
        this.searches = searches;
    }

    @Transactional(readOnly = true)
    public List<RecentSearchDto> list(UUID userId) {
        return searches.findByUserIdOrderBySearchedAtDesc(userId, Limit.of(MAX_ENTRIES))
                .stream()
                .map(RecentSearchService::toDto)
                .toList();
    }

    @Transactional
    public List<RecentSearchDto> record(UUID userId, String label, String rawUrl) {
        String url = normalizeUrl(rawUrl);
        String chip = label.trim();
        Instant now = Instant.now();

        searches.findByUserIdAndUrl(userId, url).ifPresentOrElse(
                existing -> {
                    existing.touch(chip, now);
                    searches.saveAndFlush(existing);
                },
                () -> {
                    searches.saveAndFlush(new RecentSearch(userId, chip, url, now));
                    evictBeyondCap(userId);
                });

        return list(userId);
    }

    private void evictBeyondCap(UUID userId) {
        List<RecentSearch> all = searches.findByUserIdOrderBySearchedAtDesc(userId);
        if (all.size() > MAX_ENTRIES) {
            searches.deleteAll(all.subList(MAX_ENTRIES, all.size()));
        }
    }

    private static String normalizeUrl(String rawUrl) {
        String url = rawUrl.trim();
        if (!SAFE_CHARS.matcher(url).matches()) {
            throw new ValidationException("url contains characters that are not allowed in a search URL");
        }
        // '//' is protocol-relative and off-site despite starting with a slash; reject it explicitly.
        if (!url.startsWith("/") || url.startsWith("//")) {
            throw new ValidationException("url must be a relative search URL");
        }
        int q = url.indexOf('?');
        // Locale.ROOT: under a Turkish locale 'I' lowercases to a dotless i and the allowlist match fails.
        String path = (q < 0 ? url : url.substring(0, q)).toLowerCase(Locale.ROOT);
        String query = q < 0 ? "" : url.substring(q + 1);
        if (!ALLOWED_PATHS.contains(path)) {
            throw new ValidationException("url must point at a search page");
        }
        if (query.isEmpty()) {
            return path;
        }
        String canonicalQuery = Arrays.stream(query.split("&"))
                .filter(part -> !part.isEmpty())
                .sorted()
                .collect(Collectors.joining("&"));
        String out = canonicalQuery.isEmpty() ? path : path + "?" + canonicalQuery;
        if (out.length() > 500) {
            throw new ValidationException("url is too long");
        }
        return out;
    }

    private static RecentSearchDto toDto(RecentSearch s) {
        return new RecentSearchDto(s.getLabel(), s.getUrl(), s.getSearchedAt());
    }
}

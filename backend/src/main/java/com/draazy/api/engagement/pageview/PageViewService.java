package com.draazy.api.engagement.pageview;

import com.draazy.api.security.AuthPrincipal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PageViewService {
    private static final Duration MAX_BACKDATE = Duration.ofHours(6);

    private final PageViewRepository repository;

    public PageViewService(PageViewRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public void record(PageViewBatchCreate body, AuthPrincipal principal) {
        Instant receivedAt = Instant.now();
        Instant floor = receivedAt.minus(MAX_BACKDATE);

        List<PageView> rows = new ArrayList<>(body.events().size());
        for (PageViewBatchCreate.Item item : body.events()) {
            PageView row = new PageView();
            row.setSessionId(body.sessionId());
            row.setSignedIn(principal != null);
            row.setUserId(principal != null && Boolean.TRUE.equals(body.attributed()) ? principal.userId() : null);
            row.setPath(normalisePath(item.path()));
            row.setReferrerHost(normaliseHost(item.referrerHost()));
            row.setDevice(item.device());

            Instant occurredAt = receivedAt.minusMillis(item.agoMs());
            row.setOccurredAt(occurredAt.isBefore(floor) ? floor : occurredAt);

            rows.add(row);
        }
        repository.saveAll(rows);
    }

    private static String normalisePath(String raw) {
        String path = raw.trim();

        int cut = indexOfFirst(path, '?', '#');
        if (cut >= 0) {
            path = path.substring(0, cut);
        }
        while (path.length() > 1 && path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        return path.isEmpty() ? "/" : path;
    }

    private static String normaliseHost(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String host = raw.trim();

        int scheme = host.indexOf("://");
        if (scheme >= 0) {
            host = host.substring(scheme + 3);
        }
        int credentials = host.lastIndexOf('@');
        if (credentials >= 0) {
            host = host.substring(credentials + 1);
        }
        int end = indexOfFirst(host, '/', '?', '#', ':');
        if (end >= 0) {
            host = host.substring(0, end);
        }
        host = host.toLowerCase(Locale.ROOT);
        if (host.startsWith("www.")) {
            host = host.substring(4);
        }
        return host.isBlank() ? null : host;
    }

    private static int indexOfFirst(String value, char... chars) {
        int found = -1;
        for (char c : chars) {
            int at = value.indexOf(c);
            if (at >= 0 && (found < 0 || at < found)) {
                found = at;
            }
        }
        return found;
    }
}

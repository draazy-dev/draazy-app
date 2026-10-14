package com.draazy.api.engagement.search;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.Notifier;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Saved searches. {@code newCount} is stored by the hourly job (matches since the last alert, or since saving);
 * {@code matchCount} is counted live on read, an N+1 accepted at {@link #MAX_SAVED_SEARCHES} rows. */
@Service
public class SavedSearchService {

    private static final Logger LOG = LoggerFactory.getLogger(SavedSearchService.class);
    private static final int SWEEP_BATCH_SIZE = 200;

    private final SavedSearchRepository repo;
    private final SavedSearchMapper mapper;
    private final SavedSearchMatchCounter counter;
    private final ObjectMapper objectMapper;

    // The port rather than NotificationPublisher, so the master switch and quiet hours stay in one place.
    private final Notifier notifier;

    public SavedSearchService(SavedSearchRepository repo, SavedSearchMapper mapper,
            SavedSearchMatchCounter counter, ObjectMapper objectMapper, Notifier notifier) {
        this.repo = repo;
        this.mapper = mapper;
        this.counter = counter;
        this.objectMapper = objectMapper;
        this.notifier = notifier;
    }

    // Counted here, not in the mapper: the mapper maps one row, and a match count is a count of other rows.
    @Transactional(readOnly = true)
    public List<SavedSearchResponse> list(UUID userId) {
        return repo.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(row -> mapper.toResponse(row).withMatchCount(countMatchingNow(row)))
                .toList();
    }

    // filters is a free-form jsonb with nothing for @Size to bind to; 8 KB is far past any real facet set.
    private static final int MAX_FILTERS_CHARS = 8192;

    // Bounds the standing alert workload per user; a 409, resolved by deleting one.
    private static final int MAX_SAVED_SEARCHES = 10;

    /** Create a new saved search. Returns 201 with the created resource. */
    @Transactional
    public SavedSearchResponse create(UUID userId, SavedSearchCreateRequest request) {
        String kind = request.kind() == null || request.kind().isBlank()
                ? "listings" : request.kind().strip();
        if (!"listings".equals(kind) && !"flatmates".equals(kind)) {
            throw new BadRequestException(
                    "Unknown alert kind: '" + kind + "'. Expected listings or flatmates.");
        }

        String filters = request.filters() == null ? "{}" : serializeFilters(request.filters());
        String criteria = request.criteria() == null ? null : serializeFilters(request.criteria());
        String newKey = duplicateKey(kind, "flatmates".equals(kind) ? criteria : filters,
                "flatmates".equals(kind) ? null : request.query());
        for (SavedSearch existing : repo.findByUserIdOrderByCreatedAtDesc(userId)) {
            String existingJson = "flatmates".equals(kind) ? existing.getCriteria() : existing.getFilters();
            if (kind.equals(existing.getKind())
                    && newKey.equals(duplicateKey(kind, existingJson, existing.getQuery()))) {
                return mapper.toResponse(existing).withMatchCount(countMatchingNow(existing));
            }
        }
        if (repo.countByUserId(userId) >= MAX_SAVED_SEARCHES) {
            throw new ConflictException("You can keep at most " + MAX_SAVED_SEARCHES
                    + " saved searches. Delete one to add another.");
        }

        SavedSearch entity = "flatmates".equals(kind)
                ? SavedSearch.forFlatmates(userId, criteria, label(request))
                : new SavedSearch(userId, request.query());

        entity.setName(request.name());
        if (request.filters() != null) {
            entity.setFilters(filters);
        }
        if (request.alertFrequency() != null) {
            entity.setAlertFrequency(request.alertFrequency());
        }
        entity.setChannel(AlertChannels.PUSH);
        SavedSearch saved = repo.saveAndFlush(entity);
        return mapper.toResponse(saved).withMatchCount(countMatchingNow(saved));
    }

    /** The card's summary line. The user-given name wins; otherwise there is nothing to invent. */
    private static String label(SavedSearchCreateRequest request) {
        return request.name() == null || request.name().isBlank() ? null : request.name().strip();
    }

    // Null leaves a field unchanged, so turning alerts off is alertFrequency "off". 404 if not the caller's.
    @Transactional
    public SavedSearchResponse update(UUID userId, UUID searchId, SavedSearchUpdateRequest request) {
        SavedSearch entity = repo.findByIdAndUserId(searchId, userId)
                .orElseThrow(() -> NotFoundException.of("Saved search"));
        if (request.alertFrequency() != null) {
            entity.setAlertFrequency(request.alertFrequency());
        }
        if (request.channel() != null) {
            entity.setChannel(AlertChannels.PUSH);
        }
        SavedSearch saved = repo.saveAndFlush(entity);
        return mapper.toResponse(saved).withMatchCount(countMatchingNow(saved));
    }

    // User-scoped: another user's id is a 404, never a 403.
    @Transactional
    public void delete(UUID userId, UUID searchId) {
        SavedSearch entity = repo.findByIdAndUserId(searchId, userId)
                .orElseThrow(() -> NotFoundException.of("Saved search"));
        repo.delete(entity);
    }

    private String serializeFilters(Object filters) {
        String json;
        try {
            json = objectMapper.writeValueAsString(filters);
        } catch (RuntimeException unserializable) {
            // Jackson 3 throws unchecked; an unserializable body degrades to an empty filter set.
            return "{}";
        }
        if (json.length() > MAX_FILTERS_CHARS) {
            throw new BadRequestException(
                    "filters is too large (max " + MAX_FILTERS_CHARS + " characters)");
        }
        return json;
    }

    private String duplicateKey(String kind, String json, String query) {
        String normalizedQuery = query == null ? "" : query.strip().toLowerCase(Locale.ROOT);
        return kind + ":" + canonicalJson(json) + ":" + normalizedQuery;
    }

    private String canonicalJson(String json) {
        try {
            return objectMapper.writeValueAsString(canonical(mapper.jsonStringToObject(json)));
        } catch (RuntimeException bad) {
            return "{}";
        }
    }

    private Object canonical(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> sorted = new TreeMap<>();
            map.forEach((key, nested) -> sorted.put(String.valueOf(key), canonical(nested)));
            return sorted;
        }
        if (value instanceof Collection<?> values) {
            return values.stream()
                    .map(this::canonical)
                    .sorted(Comparator.comparing(this::canonicalText))
                    .toList();
        }
        return value;
    }

    private String canonicalText(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (RuntimeException bad) {
            return String.valueOf(value);
        }
    }

    // Counts matches since the last alert (or since saving, if never alerted), and alerts while any are waiting
    // and the cadence allows. Not updated_at: trg_set_updated_at moves it on every write, this sweep's included.
    @Transactional
    public long recomputeNewCounts(Instant now) {
        long updated = 0L;
        int page = 0;
        while (true) {
            List<SavedSearch> chunk = repo.findAllByOrderByIdAsc(PageRequest.of(page, SWEEP_BATCH_SIZE));
            if (chunk.isEmpty()) {
                return updated;
            }
            for (SavedSearch search : chunk) {
                Instant alerted = search.getLastAlertedAt();
                int count;
                try {
                    count = countMatchingSince(search, alerted == null ? search.getCreatedAt() : alerted);
                } catch (RuntimeException failedSearch) {
                    LOG.warn("Skipping saved-search count for {}", search.getId(), failedSearch);
                    continue;
                }
                Instant alertedAt = count > 0 && isAlertDue(search, now) ? alert(search, count, now) : alerted;
                if (count != search.getNewCount() || alertedAt != alerted) {
                    search.setNewCount(count);
                    search.setLastAlertedAt(alertedAt);
                    updated++;
                }
            }
            page++;
        }
    }

    // Measured from lastAlertedAt so a restart cannot re-send. "instant" means the next hourly run;
    // an unknown frequency fails toward the quieter daily.
    private boolean isAlertDue(SavedSearch search, Instant now) {
        String frequency = search.getAlertFrequency() == null
                ? "daily" : search.getAlertFrequency().strip().toLowerCase(Locale.ROOT);
        if ("off".equals(frequency)) {
            return false;
        }
        Instant last = search.getLastAlertedAt();
        if (last == null) {
            return true;
        }
        Duration floor = switch (frequency) {
            case "instant" -> Duration.ZERO;
            case "weekly" -> Duration.ofDays(7);
            default -> Duration.ofDays(1);
        };
        return !last.plus(floor).isAfter(now);
    }

    // The count is the only fact the job knows; describing the matches would cost a query per alert.
    private Instant alert(SavedSearch search, int count, Instant now) {
        String noun = "flatmates".equals(search.getKind()) ? "match" : "home";
        String what = count == 1 ? "1 new " + noun : count + " new " + noun + "s";
        String which = search.getName() == null || search.getName().isBlank()
                ? (search.getLabel() == null || search.getLabel().isBlank()
                        ? "your saved search" : search.getLabel())
                : search.getName();
        notifier.notify(
                search.getUserId(),
                "match.saved-search",
                what + " match " + which,
                "Tap to see what came up since you last looked.",
                "/dashboard#alerts");
        return now;
    }

    private int countMatchingSince(SavedSearch search, Instant baseline) {
        if (baseline == null) {
            return 0;
        }
        return countMatching(search, baseline);
    }

    private int countMatchingNow(SavedSearch search) {
        return countMatching(search, null);
    }

    private int countMatching(SavedSearch search, Instant baseline) {
        return counter.count(search, baseline);
    }
}

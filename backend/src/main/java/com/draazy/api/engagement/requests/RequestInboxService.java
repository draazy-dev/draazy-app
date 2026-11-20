package com.draazy.api.engagement.requests;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.RequestSource;
import com.draazy.api.common.trust.RequestSource.RequestView;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RequestInboxService {
    static final String RECEIVED = "received";
    static final String SENT = "sent";
    private static final Duration SENT_HISTORY = Duration.ofDays(30);
    private static final Duration RECEIVED_HISTORY = Duration.ofDays(90);
    private static final Set<String> CONNECTION_KINDS = Set.of("contact", "visit", "offer", "flatmate", "group");

    private static final Comparator<RequestItem> NEWEST_FIRST = Comparator.comparing(RequestItem::createdAt).reversed();

    private static final Comparator<RequestItem> RECEIVED_ORDER = Comparator
            .comparing((RequestItem i) -> !RequestSource.PENDING.equals(i.state()))
            .thenComparing((RequestItem i) -> RequestSource.PENDING.equals(i.state()) ? i.reminders().lastAt() : null,
                    Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(NEWEST_FIRST);

    private static final Comparator<RequestItem> SENT_ORDER = Comparator
            .comparing((RequestItem i) -> !RequestSource.PENDING.equals(i.state()))
            .thenComparing(NEWEST_FIRST);

    private final RequestSources sources;
    private final RequestReminderRepository reminders;
    private final RequestHiddenRepository hidden;
    private final PropertyRepository properties;

    RequestInboxService(RequestSources sources, RequestReminderRepository reminders, RequestHiddenRepository hidden,
            PropertyRepository properties) {
        this.sources = sources;
        this.reminders = reminders;
        this.hidden = hidden;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public Page<RequestItem> list(UUID userId, String box, Pageable pageable) {
        boolean sent = isSent(box);
        List<RequestView> views = sent ? sentViews(userId) : receivedViews(userId);
        Map<String, RequestReminderRepository.Tally> tallies = tallies(views);
        List<RequestItem> items = views.stream().map(view -> item(view, tallies.get(key(view.kind(), view.id())), sent))
                .sorted(sent ? SENT_ORDER : RECEIVED_ORDER).toList();
        int from = (int) Math.min(pageable.getOffset(), items.size());
        int to = (int) Math.min((long) from + pageable.getPageSize(), items.size());
        return new PageImpl<>(items.subList(from, to), pageable, items.size());
    }

    @Transactional(readOnly = true)
    public PendingCount pendingCount(UUID userId) {
        Instant since = Instant.now().minus(RECEIVED_HISTORY);
        List<UUID> owned = properties.findIdsByOwnerId(userId);
        long count = sources.all().stream().filter(source -> CONNECTION_KINDS.contains(source.kind()))
                .flatMap(source -> source.received(userId, owned, since).stream())
                .filter(RequestView::pending).count();
        return new PendingCount(count);
    }

    public record PendingCount(long count) {
    }

    @Transactional
    public void remove(UUID userId, String box, String kind, UUID id) {
        var source = sources.of(kind);
        if (!isSent(box)) {
            RequestView view = source.received(userId, properties.findIdsByOwnerId(userId),
                            Instant.now().minus(RECEIVED_HISTORY)).stream()
                    .filter(v -> v.id().equals(id) && !RequestSource.WITHDRAWN.equals(v.state())).findFirst()
                    .orElseThrow(() -> NotFoundException.of("Request"));
            if (view.pending()) {
                throw new ConflictException("Accept or decline this request before clearing it.");
            }
            hidden.save(new RequestHidden(userId, kind, id));
            return;
        }
        RequestView view = source.findSent(userId, id).orElseThrow(() -> NotFoundException.of("Request"));
        if (view.pending()) {
            source.withdraw(userId, id);
        } else {
            hidden.save(new RequestHidden(userId, kind, id));
        }
    }

    private static boolean isSent(String box) {
        return switch (box) {
            case SENT -> true;
            case RECEIVED -> false;
            default -> throw new BadRequestException(ErrorCodes.INVALID_BOX, "box must be 'received' or 'sent'");
        };
    }

    private List<RequestView> sentViews(UUID userId) {
        Instant since = Instant.now().minus(SENT_HISTORY);
        Map<String, Instant> cleared = clearedAt(userId);
        return sources.all().stream().flatMap(source -> source.sent(userId, since).stream())
                .filter(view -> !clearedBefore(view, cleared.get(key(view.kind(), view.id())))).toList();
    }

    private Map<String, Instant> clearedAt(UUID userId) {
        return hidden.findByUser(userId).stream()
                .collect(Collectors.toMap(h -> key(h.getId().kind(), h.getId().refId()), RequestHidden::getHiddenAt));
    }

    private static boolean clearedBefore(RequestView view, Instant hiddenAt) {
        if (hiddenAt == null || view.pending()) {
            return false;
        }
        Instant lastMoved = view.decidedAt() == null || view.decidedAt().isBefore(view.createdAt())
                ? view.createdAt() : view.decidedAt();
        return !lastMoved.isAfter(hiddenAt);
    }

    private List<RequestView> receivedViews(UUID userId) {
        Instant since = Instant.now().minus(RECEIVED_HISTORY);
        Map<String, Instant> cleared = clearedAt(userId);
        List<UUID> owned = properties.findIdsByOwnerId(userId);
        return sources.all().stream().flatMap(source -> source.received(userId, owned, since).stream())
                .filter(view -> !RequestSource.WITHDRAWN.equals(view.state()))
                .filter(view -> !clearedBefore(view, cleared.get(key(view.kind(), view.id())))).toList();
    }

    private Map<String, RequestReminderRepository.Tally> tallies(Collection<RequestView> views) {
        if (views.isEmpty()) {
            return Map.of();
        }
        return reminders.tallyFor(views.stream().map(RequestView::id).toList()).stream()
                .collect(Collectors.toMap(t -> key(t.getKind(), t.getRefId()), Function.identity()));
    }

    private static RequestItem item(RequestView view, RequestReminderRepository.Tally tally, boolean sent) {
        Instant lastAt = tally == null ? null : tally.getLastAt();
        Instant nextAt = sent && view.pending() ? ReminderSchedule.nextShown(view, lastAt) : null;
        return new RequestItem(view.id(), view.kind(), view.state(), view.status(),
                new RequestItem.Party(view.party().id(), view.party().name(), view.party().verified()),
                new RequestItem.Target(view.target().id(), view.target().type(), view.target().title(),
                        view.target().link()),
                view.message(), view.slot(), view.share(), view.createdAt(), view.decidedAt(),
                new RequestItem.Reminders(tally == null ? 0 : tally.getTotal(), lastAt, nextAt));
    }

    private static String key(String kind, UUID id) {
        return kind + ":" + id;
    }
}

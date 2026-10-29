package com.draazy.api.engagement.notification;

import com.draazy.api.common.error.NotFoundException;
import java.time.Duration;
import java.time.Instant;
import java.util.Collection;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {
    public static final Duration READ_VISIBILITY = Duration.ofDays(30);

    private final NotificationRepository repo;
    private final NotificationMapper mapper;

    public NotificationService(NotificationRepository repo, NotificationMapper mapper) {
        this.repo = repo;
        this.mapper = mapper;
    }

    @Transactional(readOnly = true)
    public Page<NotificationResponse> list(UUID userId, Boolean read, Pageable pageable) {
        Pageable sorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        Instant now = Instant.now();
        return repo.findDeliverable(userId, read, now, now.minus(READ_VISIBILITY), sorted)
                .map(mapper::toResponse);
    }

    @Transactional(readOnly = true)
    public long unreadCount(UUID userId) {
        return repo.countUnreadDeliverable(userId, Instant.now());
    }

    @Transactional
    public void markRead(UUID userId, Collection<UUID> ids) {
        Instant now = Instant.now();
        if (ids == null || ids.isEmpty()) {
            repo.markAllRead(userId, now);
        } else {
            repo.markRead(userId, ids, now);
        }
    }

    @Transactional
    public void dismiss(UUID userId, UUID id) {
        Notification entity = repo.findByIdAndUserId(id, userId)
                .orElseThrow(() -> NotFoundException.of("Notification"));
        repo.delete(entity);
    }

    @Transactional
    public void dismiss(UUID userId, Collection<UUID> ids) {
        repo.deleteMine(userId, ids);
    }
}

package com.draazy.api.engagement.requests;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ReminderTooSoonException;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.RequestSource.RequestView;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RequestReminderService {

    private static final DateTimeFormatter WHEN =
            DateTimeFormatter.ofPattern("d MMM, h:mm a", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"));

    private final RequestSources sources;
    private final RequestReminderRepository reminders;
    private final UserRepository users;
    private final Notifier notifier;
    private final RateLimitLock locks;

    RequestReminderService(RequestSources sources, RequestReminderRepository reminders, UserRepository users,
            Notifier notifier, RateLimitLock locks) {
        this.sources = sources;
        this.reminders = reminders;
        this.users = users;
        this.notifier = notifier;
        this.locks = locks;
    }

    @Transactional
    public RequestReminderResponse remind(UUID requesterId, String kind, UUID id) {
        RequestView view = sources.of(kind).findSent(requesterId, id).filter(RequestView::pending)
                .filter(v -> v.recipientId() != null).orElseThrow(() -> NotFoundException.of("Request"));
        UUID recipientId = view.recipientId();

        // One recipient's reminders are serialised so the once-a-day notification cannot be doubled by a race.
        locks.holdUntilCommit(RateLimitLock.Limit.REQUEST_REMINDER, recipientId.toString());
        Instant now = Instant.now();
        Instant earliest = ReminderSchedule.earliest(view.createdAt(), reminders.lastSentAt(kind, id));
        if (now.isBefore(earliest)) {
            throw new ReminderTooSoonException(earliest,
                    "You can send another reminder after " + WHEN.format(earliest) + ".");
        }

        boolean notify = !reminders.existsByRecipientIdAndNotifiedTrueAndSentAtAfter(
                recipientId, now.minus(ReminderSchedule.GAP));
        reminders.save(new RequestReminder(kind, id, requesterId, recipientId, notify, now));
        if (notify) {
            String name = users.findById(requesterId).map(User::getName).filter(n -> !n.isBlank()).orElse("Someone");
            notifier.notify(recipientId, "request.reminder", "Reminder from " + name,
                    name + " is still waiting for your reply about " + view.target().title() + ".",
                    "/messages?tab=requests");
        }
        return new RequestReminderResponse(reminders.countByKindAndRefId(kind, id), now,
                ReminderSchedule.nextShown(view, now));
    }
}

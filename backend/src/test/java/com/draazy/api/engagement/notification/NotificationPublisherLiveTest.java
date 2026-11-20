package com.draazy.api.engagement.notification;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.draazy.api.common.trust.LiveUpdates;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class NotificationPublisherLiveTest {
    private final NotificationRepository notifications = mock(NotificationRepository.class);
    private final NotificationPreferenceService preferences = mock(NotificationPreferenceService.class);
    private final LiveUpdates live = mock(LiveUpdates.class);
    private final StaffEmailCopy staffEmail = mock(StaffEmailCopy.class);
    private final NotificationPublisher publisher =
            new NotificationPublisher(notifications, preferences, live, staffEmail);
    private final UUID user = UUID.randomUUID();

    @Test
    void aDeliveredAlertIsAlsoOfferedAsAStaffEmail() {
        when(preferences.effective(user)).thenReturn(prefs(true, false));

        publisher.notify(user, "queue.report", "New abuse report", "Listing report: spam", "/admin/reports");

        verify(staffEmail).send(user, "New abuse report", "Listing report: spam", "/admin/reports");
    }

    @Test
    void noEmailWhenTheUserTurnedEmailOff() {
        when(preferences.effective(user)).thenReturn(prefs(false, false));

        publisher.notify(user, "queue.report", "New abuse report", "Body", "/admin/reports");

        verify(staffEmail, never()).send(any(), any(), any(), any());
    }

    @Test
    void quietHoursHoldTheBellRowButNotTheEmail() {
        when(preferences.effective(user)).thenReturn(prefs(true, true));
        publisher.useClock(Clock.fixed(Instant.parse("2026-01-01T18:00:00Z"), ZoneOffset.UTC));

        publisher.notify(user, "queue.draft-decision", "New customer draft decision", "Body", "/admin/legal");

        verify(staffEmail).send(user, "New customer draft decision", "Body", "/admin/legal");
        verify(live, never()).notificationsChanged(any());
    }

    @Test
    void aDeliveredNotificationTellsTheUsersTabs() {
        when(preferences.effective(user)).thenReturn(prefs(false));

        publisher.notify(user, "visit", "Visit booked", "Body", "/visits");

        verify(live).notificationsChanged(user);
    }

    @Test
    void oneHeldForQuietHoursStaysSilentUntilItIsDue() {
        when(preferences.effective(user)).thenReturn(prefs(true));
        publisher.useClock(Clock.fixed(Instant.parse("2026-01-01T18:00:00Z"), ZoneOffset.UTC));

        publisher.notify(user, "visit", "Visit booked", "Body", "/visits");

        verify(notifications).saveAndFlush(any());
        verify(live, never()).notificationsChanged(user);
    }

    @Test
    void markingReadSpeaksOnlyWhenARowChanged() {
        when(notifications.markReadByTypeAndLink(user, "visit", "/a")).thenReturn(0);
        when(notifications.markReadByTypeAndLink(user, "visit", "/b")).thenReturn(1);

        publisher.markRead(user, "visit", "/a");
        verify(live, never()).notificationsChanged(user);

        publisher.markRead(user, "visit", "/b");
        verify(live).notificationsChanged(user);
    }

    private static NotificationPreferencesDto prefs(boolean quiet) {
        return prefs(false, quiet);
    }

    private static NotificationPreferencesDto prefs(boolean email, boolean quiet) {
        return new NotificationPreferencesDto(email, false, false, true,
                new QuietHoursDto(quiet, "22:00", "07:00"), "en", false);
    }
}

package com.draazy.api.engagement.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.EmailSender;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class StaffEmailCopyTest {
    private final UserRepository users = mock(UserRepository.class);
    private final EmailSender email = mock(EmailSender.class);
    private final StaffEmailCopy copy = new StaffEmailCopy(users, email, "https://app.draazy.test/", Runnable::run);
    private final UUID staff = UUID.randomUUID();

    @Test
    void theSendLeavesTheCallersThread() {
        List<Runnable> queued = new ArrayList<>();
        StaffEmailCopy deferred = new StaffEmailCopy(users, email, "https://app.draazy.test", queued::add);
        when(users.findLiveStaffEmail(staff)).thenReturn(Optional.of("asha@draazy.test"));

        deferred.send(staff, "New refund request", "Order 1042", "/admin/refunds");
        verify(email, never()).send(anyString(), anyString(), anyString());

        queued.forEach(Runnable::run);
        verify(email).send(eq("asha@draazy.test"), eq("Draazy: New refund request"), anyString());
    }

    @Test
    void aStaffAlertIsMailedWithAnAbsoluteLink() {
        when(users.findLiveStaffEmail(staff)).thenReturn(Optional.of("asha@draazy.test"));

        copy.send(staff, "New customer draft decision", "Rent Agreement: changes requested", "/admin/rent-agreement");

        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(email).send(eq("asha@draazy.test"), eq("Draazy: New customer draft decision"), text.capture());
        assertThat(text.getValue())
                .contains("Rent Agreement: changes requested")
                .contains("https://app.draazy.test/admin/rent-agreement");
    }

    @Test
    void anyoneWhoIsNotLiveStaffGetsNoEmail() {
        when(users.findLiveStaffEmail(staff)).thenReturn(Optional.empty());

        copy.send(staff, "Escalated: 2 listings to review", "Oldest: 2BHK in Wakad", "/admin/properties");

        verify(email, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    void aFailedSendNeverBreaksTheCaller() {
        when(users.findLiveStaffEmail(staff)).thenReturn(Optional.of("asha@draazy.test"));
        doThrow(new IllegalStateException("provider down")).when(email).send(anyString(), anyString(), any());

        assertThatCode(() -> copy.send(staff, "New report", "Listing report: spam", null))
                .doesNotThrowAnyException();
    }
}

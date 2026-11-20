package com.draazy.api.services.request;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.draazy.api.common.trust.Notifier;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.security.InMemoryWriteRateLimitStore;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Co-fill invite WhatsApp")
class CoFillInviteWhatsAppTest {
    private static final String MOBILE = "9811122233";
    private static final UUID REQUEST_ID = UUID.fromString("00000000-0000-0000-0000-00000000000a");
    private static final UUID PARTY_ID = UUID.fromString("00000000-0000-0000-0000-00000000000b");

    private final DecisionMessenger messenger = mock(DecisionMessenger.class);
    private final Notifier notifier = mock(Notifier.class);
    private final CoFillInviteWhatsApp whatsApp = budgeted(60);

    private CoFillInviteWhatsApp budgeted(int perHour) {
        return new CoFillInviteWhatsApp(messenger, notifier, InMemoryWriteRateLimitStore::new,
                "https://draazy.test/", perHour);
    }

    private static ServiceRequest request(String type, Map<String, Object> details) {
        return request(type, details, UUID.fromString("00000000-0000-0000-0000-00000000000c"));
    }

    private static ServiceRequest request(String type, Map<String, Object> details, UUID requester) {
        ServiceRequest request = mock(ServiceRequest.class);
        when(request.getRequesterId()).thenReturn(requester);
        when(request.getId()).thenReturn(REQUEST_ID);
        when(request.getType()).thenReturn(type);
        when(request.getDetails()).thenReturn(details);
        return request;
    }

    private static ServiceRequestParty party(String role, UUID userId) {
        ServiceRequestParty party = mock(ServiceRequestParty.class);
        when(party.getId()).thenReturn(PARTY_ID);
        when(party.getRole()).thenReturn(role);
        when(party.getUserId()).thenReturn(userId);
        return party;
    }

    @Test
    @DisplayName("a new number gets the inviter, its side, the property and the agreement link")
    void newNumber() {
        whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of("property", "B-1204, Skyline, Baner")),
                party("tenant", null), MOBILE, "Asha Patil");

        verify(messenger).sendAgreementInvite(MOBILE, "Asha Patil", "tenant", "B-1204, Skyline, Baner",
                "https://draazy.test/services/rent-agreement?party=" + PARTY_ID + "&request=" + REQUEST_ID);
    }

    @Test
    @DisplayName("a registered invitee with WhatsApp off in settings gets no message")
    void respectsPreference() {
        UUID invitee = UUID.randomUUID();
        when(notifier.allowsWhatsapp(invitee)).thenReturn(false);

        whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of()), party("owner", invitee), MOBILE, "Ravi");

        verify(messenger, never()).sendAgreementInvite(anyString(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("a registered invitee who allows WhatsApp is messaged")
    void registeredAllowed() {
        UUID invitee = UUID.randomUUID();
        when(notifier.allowsWhatsapp(invitee)).thenReturn(true);

        whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, null), party("owner", invitee), MOBILE, null);

        verify(messenger).sendAgreementInvite(MOBILE, "Your tenant", "owner", "your rented home",
                "https://draazy.test/services/rent-agreement?party=" + PARTY_ID + "&request=" + REQUEST_ID);
    }

    @Test
    @DisplayName("only rent agreements send the invite template")
    void otherServicesSkip() {
        whatsApp.send(request(ServiceRequestTypes.LEGAL, Map.of()), party("tenant", null), MOBILE, "Asha");

        verify(messenger, never()).sendAgreementInvite(anyString(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("reports the invite queued only when it sends and the template is configured")
    void reportsQueued() {
        UUID optedOut = UUID.randomUUID();
        when(notifier.allowsWhatsapp(optedOut)).thenReturn(false);
        when(messenger.agreementInviteDeliverable(MOBILE)).thenReturn(true);

        assertThat(whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of()), party("tenant", null),
                MOBILE, "Asha")).isTrue();
        assertThat(whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of()), party("owner", optedOut),
                MOBILE, "Asha")).isFalse();
        assertThat(whatsApp.send(request(ServiceRequestTypes.LEGAL, Map.of()), party("tenant", null),
                MOBILE, "Asha")).isFalse();

        when(messenger.agreementInviteDeliverable(MOBILE)).thenReturn(false);
        assertThat(whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of()), party("tenant", null),
                MOBILE, "Asha")).isFalse();
    }

    @Test
    @DisplayName("a provider failure never fails the already-saved invite")
    void bestEffort() {
        when(messenger.sendAgreementInvite(anyString(), anyString(), anyString(), anyString(), anyString()))
                .thenThrow(new IllegalStateException("down"));

        assertThatCode(() -> whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of()),
                party("tenant", null), MOBILE, "Asha")).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("one number gets at most three invites a day, whoever types it")
    void perNumberCap() {
        for (int i = 0; i < 4; i++) {
            whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of(), UUID.randomUUID()),
                    party("tenant", null), MOBILE, "Asha");
        }

        verify(messenger, times(CoFillInviteWhatsApp.MAX_PER_NUMBER))
                .sendAgreementInvite(anyString(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("one inviter sends at most ten invites a day, however many numbers they type")
    void perInviterCap() {
        for (int i = 0; i < 11; i++) {
            whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of()), party("tenant", null),
                    "98111222" + (10 + i), "Asha");
        }

        verify(messenger, times(CoFillInviteWhatsApp.MAX_PER_INVITER))
                .sendAgreementInvite(anyString(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("an inviter over their own cap cannot use up someone else's number")
    void cappedInviterSparesNumber() {
        UUID griefer = UUID.randomUUID();
        for (int i = 0; i < CoFillInviteWhatsApp.MAX_PER_INVITER; i++) {
            whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of(), griefer), party("tenant", null),
                    "98111222" + (10 + i), "Asha");
        }
        for (int i = 0; i < 5; i++) {
            whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of(), griefer), party("tenant", null),
                    MOBILE, "Asha");
        }
        clearInvocations(messenger);

        whatsApp.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of(), UUID.randomUUID()),
                party("tenant", null), MOBILE, "Ravi");

        verify(messenger).sendAgreementInvite(eq(MOBILE), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("the platform's hourly invite budget caps everyone together")
    void platformCap() {
        CoFillInviteWhatsApp capped = budgeted(2);
        when(messenger.agreementInviteDeliverable(anyString())).thenReturn(true);
        boolean[] queued = new boolean[3];
        for (int i = 0; i < 3; i++) {
            queued[i] = capped.send(request(ServiceRequestTypes.RENT_AGREEMENT, Map.of(), UUID.randomUUID()),
                    party("tenant", null), "98111222" + (10 + i), "Asha");
        }

        verify(messenger, times(2)).sendAgreementInvite(anyString(), anyString(), anyString(), anyString(), anyString());
        assertThat(queued).containsExactly(true, true, false);
    }

    @Test
    @DisplayName("typed text is flattened to one line and capped, as Meta requires")
    void oneLine() {
        assertThat(CoFillInviteWhatsApp.oneLine("  Asha\n\tPatil   ")).isEqualTo("Asha Patil");
        assertThat(CoFillInviteWhatsApp.oneLine(" \n ")).isNull();
        assertThat(CoFillInviteWhatsApp.oneLine("x".repeat(200))).hasSize(80);
    }
}

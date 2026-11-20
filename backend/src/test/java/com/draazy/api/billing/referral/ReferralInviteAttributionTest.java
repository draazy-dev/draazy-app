package com.draazy.api.billing.referral;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ReferralInviteAttributionTest {
    private static final String MOBILE = "9866630001";

    private final ReferralInviteRepository invites = mock(ReferralInviteRepository.class);
    private final ReferralCodeRepository codes = mock(ReferralCodeRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ReferralRedemption redemption = mock(ReferralRedemption.class);
    private final PlatformSettings settings = mock(PlatformSettings.class);
    private final UUID inviter = UUID.randomUUID();
    private final UUID newcomer = UUID.randomUUID();
    private final ReferralCode code = mock(ReferralCode.class);
    private final User referred = mock(User.class);
    private ReferralInviteAttribution attribution;

    @BeforeEach
    void wire() {
        attribution = new ReferralInviteAttribution(invites, codes, users, redemption,
                mock(ReferralSignals.class), settings);
        when(settings.referralRewardsEnabled()).thenReturn(true);
        when(invites.referrersSince(eq(MOBILE), any(), any())).thenReturn(List.of(inviter));
        when(codes.findById(inviter)).thenReturn(Optional.of(code));
        when(users.findById(newcomer)).thenReturn(Optional.of(referred));
    }

    @Test
    void anInvitedNumberBecomesAPendingReferralOnTheWhatsappChannel() {
        attribution.accountCreated(newcomer, MOBILE);

        verify(redemption).attribute(eq(referred), eq(code), eq(ShareChannels.WHATSAPP), any());
    }

    @Test
    void aNumberNobodyInvitedIsLeftAlone() {
        when(invites.referrersSince(eq(MOBILE), any(), any())).thenReturn(List.of());

        attribution.accountCreated(newcomer, MOBILE);

        verify(redemption, never()).attribute(any(), any(), any(), any());
    }

    @Test
    void withTheReferralFlagOffNothingIsAttributed() {
        when(settings.referralRewardsEnabled()).thenReturn(false);

        attribution.accountCreated(newcomer, MOBILE);

        verify(redemption, never()).attribute(any(), any(), any(), any());
    }

    @Test
    void aRefusedAttributionNeverBreaksSignup() {
        doThrow(new ConflictException("no")).when(redemption).attribute(any(), any(), any(), any());

        attribution.accountCreated(newcomer, MOBILE);

        verify(redemption).attribute(any(), any(), any(), any());
    }
}

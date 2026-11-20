package com.draazy.api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.referral.ReferralInviteRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class ReferralInvitesTest extends AbstractApiTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired ReferralInviteRepository inviteRows;
    @PersistenceContext EntityManager em;

    @MockitoBean
    DecisionMessenger messenger;

    private final Set<TransactionSynchronization> fired = Collections.newSetFromMap(new IdentityHashMap<>());

    private User user(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Asha Kulkarni");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private ResultActions invite(User caller, String mobile) throws Exception {
        return mvc.perform(post(Routes.Referrals.INVITES)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"mobile\":\"" + mobile + "\"}"));
    }

    private void flag(boolean on) {
        jdbc.update("update settings set value = jsonb_set(value, '{referralRewards}', ?::jsonb) where key = 'flags'",
                String.valueOf(on));
    }

    private int invitesTo(String mobile) {
        em.flush();
        return jdbc.queryForObject("select count(*) from referral_invites where mobile = ?",
                Integer.class, mobile);
    }

    private void commit() {
        for (TransactionSynchronization s : TransactionSynchronizationManager.getSynchronizations()) {
            if (fired.add(s)) {
                s.afterCommit();
            }
        }
    }

    private String codeOf(User u) throws Exception {
        String body = mvc.perform(get(Routes.Referrals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll("(?s).*\"code\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void withoutTheApiTheInviteFallsBackToAWhatsappLinkCarryingTheReferrersCode() throws Exception {
        User referrer = user("9866640001");
        when(messenger.referralInviteEnabled()).thenReturn(false);

        String url = invite(referrer, "9866640002").andExpect(status().isOk())
                .andExpect(jsonPath("$.delivery").value("open_whatsapp"))
                .andReturn().getResponse().getContentAsString()
                .replaceAll("(?s).*\"whatsappUrl\":\"([^\"]+)\".*", "$1");

        assertThat(url).startsWith("https://wa.me/919866640002?text=");
        String text = URLDecoder.decode(url.substring(url.indexOf("text=") + 5), StandardCharsets.UTF_8);
        assertThat(text).contains("/signup?ref=" + codeOf(referrer));
        verify(messenger, never()).sendReferralInvite(anyString(), anyString(), anyString());
        assertThat(invitesTo("9866640002")).isEqualTo(1);
    }

    @Test
    void withTheApiConfiguredTheMessageIsSentAfterCommitAndNoLinkIsReturned() throws Exception {
        User referrer = user("9866640011");
        when(messenger.referralInviteEnabled()).thenReturn(true);
        when(messenger.sendReferralInvite(anyString(), anyString(), anyString())).thenReturn(true);

        invite(referrer, "98666 40012").andExpect(status().isOk())
                .andExpect(jsonPath("$.delivery").value("sent"))
                .andExpect(jsonPath("$.whatsappUrl").doesNotExist());
        verify(messenger, never()).sendReferralInvite(anyString(), anyString(), anyString());

        commit();

        verify(messenger).sendReferralInvite(eq("9866640012"), eq("Asha"),
                org.mockito.ArgumentMatchers.contains("/signup?ref=" + codeOf(referrer)));
    }

    @Test
    void aMalformedNumberOrYourOwnIsRefused() throws Exception {
        User referrer = user("9866640021");

        invite(referrer, "12345").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("invalid_mobile"));
        invite(referrer, "9866640021").andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("own_number"));
    }

    @Test
    void thePerDayCapStopsFurtherInvites() throws Exception {
        User referrer = user("9866640031");
        for (int i = 0; i < 10; i++) {
            jdbc.update("insert into referral_invites (referrer_id, mobile, delivery) values (?, ?, 'open_whatsapp')",
                    referrer.getId(), "98666401" + String.format("%02d", i));
        }

        invite(referrer, "9866640199").andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("invite_limit"));
    }

    @Test
    void anExistingMemberOrAnAlreadyInvitedNumberIsSkippedWithoutSendingAndWithTheSameAnswer() throws Exception {
        User referrer = user("9866640041");
        User member = user("9866640042");
        User other = user("9866640043");
        when(messenger.referralInviteEnabled()).thenReturn(true);
        when(messenger.sendReferralInvite(anyString(), anyString(), anyString())).thenReturn(true);

        invite(referrer, member.getMobile()).andExpect(status().isOk())
                .andExpect(jsonPath("$.delivery").value("sent"));
        invite(referrer, "9866640044").andExpect(status().isOk())
                .andExpect(jsonPath("$.delivery").value("sent"));
        invite(other, "9866640044").andExpect(status().isOk())
                .andExpect(jsonPath("$.delivery").value("sent"));
        commit();

        verify(messenger).sendReferralInvite(eq("9866640044"), anyString(), anyString());
        verify(messenger, never()).sendReferralInvite(eq(member.getMobile()), anyString(), anyString());
        assertThat(invitesTo("9866640044")).isEqualTo(2);
    }

    @Test
    void withTheFlagOffInvitesAreRefused() throws Exception {
        User referrer = user("9866640051");
        flag(false);

        invite(referrer, "9866640052").andExpect(status().isConflict());
        assertThat(invitesTo("9866640052")).isZero();
        verify(messenger, never()).sendReferralInvite(any(), any(), any());
    }

    @Test
    void onlyAnInviteWeActuallySentClaimsTheFriendAtSignUp() {
        User opened = user("9866640061");
        User skipped = user("9866640062");
        User sent = user("9866640063");
        String friend = "9866640064";
        for (Object[] row : new Object[][] {{opened, "open_whatsapp"}, {skipped, "skipped"}, {sent, "sent"}}) {
            jdbc.update("insert into referral_invites (referrer_id, mobile, delivery) values (?, ?, ?)",
                    ((User) row[0]).getId(), friend, row[1]);
        }

        assertThat(inviteRows.referrersSince(friend, Instant.now().minus(Duration.ofDays(1)), PageRequest.of(0, 5)))
                .containsExactly(sent.getId());
    }
}

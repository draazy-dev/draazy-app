package com.draazy.api.identity.verification;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import com.draazy.api.services.support.IdentityAppealRequest;
import com.draazy.api.services.support.IdentityAppealService;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
@DisplayName("Identity appeal decisions and the paid WhatsApp notice")
class IdentityAppealWhatsappTest {

    @MockitoBean
    DecisionMessenger messenger;

    @Autowired
    UserRepository users;

    @Autowired
    IdentityVerificationRepository verifications;

    @Autowired
    IdentityAppealService appeals;

    @Autowired
    IdentityVerificationService identity;

    @Autowired
    JdbcTemplate jdbc;

    private final List<UUID> created = new ArrayList<>();

    // The notice fires after commit, so these cases commit and are cleaned up by hand.
    @AfterEach
    void cleanUp() {
        created.forEach(id -> {
            jdbc.update("delete from audit_log where action like 'identity.appeal.%' and entity_id in "
                    + "(select id::text from identity_verifications where user_id = ?)", id);
            identity.erase(id);
            jdbc.update("delete from support_ticket_messages where ticket_id in "
                    + "(select id from support_tickets where user_id = ?)", id);
            jdbc.update("delete from support_tickets where user_id = ?", id);
            jdbc.update("delete from notifications where user_id = ?", id);
        });
    }

    private User user() {
        User user = new User(String.format("98%08d", ThreadLocalRandom.current().nextInt(100_000_000)),
                Roles.Wire.BUYER);
        user.setMobileVerified(true);
        User saved = users.saveAndFlush(user);
        created.add(saved.getId());
        return saved;
    }

    private AuthPrincipal principal(User user, String role) {
        return new AuthPrincipal(user.getId(), role, "ops", true, true);
    }

    private IdentityVerification openAppeal(User applicant) {
        IdentityVerification v = new IdentityVerification(applicant.getId(), IdentityDocTypes.PAN, Instant.now());
        v.setStatus(VerificationStatuses.REJECTED);
        v.setRejectionReason("blurry");
        v.setReviewerId(user().getId());
        v.setDecidedAt(Instant.now());
        v.setConsentNoticeVersion("2026-09");
        v.setConsentLanguage("en");
        IdentityVerification saved = verifications.saveAndFlush(v);
        appeals.open(principal(applicant, "buyer"), new IdentityAppealRequest("Please look again."));
        return saved;
    }

    @Test
    @DisplayName("upholding the appeal sends the WhatsApp notice")
    void upholdSendsWhatsapp() {
        User applicant = user();
        IdentityVerification v = openAppeal(applicant);

        appeals.uphold(principal(user(), "admin"), v.getId());

        verify(messenger).sendIdentityDecision(eq(applicant.getMobile()), anyString());
    }

    @Test
    @DisplayName("reopening the appeal sends the WhatsApp notice")
    void reopenSendsWhatsapp() {
        User applicant = user();
        IdentityVerification v = openAppeal(applicant);

        appeals.reopen(principal(user(), "admin"), v.getId());

        verify(messenger).sendIdentityDecision(eq(applicant.getMobile()), anyString());
    }

    @Test
    @DisplayName("a refused decision sends nothing")
    void refusedDecisionSendsNothing() {
        User applicant = user();
        IdentityVerification v = openAppeal(applicant);

        assertThatThrownBy(() -> appeals.uphold(principal(applicant, "buyer"), v.getId()))
                .isInstanceOf(RuntimeException.class);

        verify(messenger, never()).sendIdentityDecision(anyString(), anyString());
    }
}

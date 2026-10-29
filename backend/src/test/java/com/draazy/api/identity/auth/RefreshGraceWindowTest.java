package com.draazy.api.identity.auth;

import static com.draazy.api.identity.auth.RefreshTokenService.MAX_CONSECUTIVE_GRACES;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.draazy.api.common.error.UnauthorizedException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@TestPropertySource(properties = "draazy.security.jwt.refresh-grace=15s")
@Transactional
@DisplayName("refresh grace window — a replay that lost a race is served, not punished")
class RefreshGraceWindowTest {
    @Autowired
    RefreshTokenService refreshTokens;

    @Autowired
    UserRepository users;

    private UUID persistUser() {
        User u = new User("9876500077", "buyer");
        u.setMobileVerified(true);
        return users.saveAndFlush(u).getId();
    }

    @Test
    @DisplayName("the losing tab is issued the family's live token rather than refused")
    void theLosingTabIsServedFromTheFamilysLiveHead() {
        UUID userId = persistUser();

        String first = refreshTokens.issue(userId);
        var winner = refreshTokens.rotate(first);

        var loser = refreshTokens.rotate(first);
        assertThat(loser.userId()).isEqualTo(userId);
        assertThat(loser.refreshToken()).isNotIn(first, winner.refreshToken());

        assertThat(refreshTokens.rotate(loser.refreshToken()).userId()).isEqualTo(userId);
    }

    @Test
    @DisplayName("a token from a family that was already burned is still refused")
    void aBurnedFamilyIsNotResurrectedByTheWindow() {
        UUID userId = persistUser();

        String first = refreshTokens.issue(userId);
        var second = refreshTokens.rotate(first);

        refreshTokens.revokeAllForUser(userId);

        assertThatThrownBy(() -> refreshTokens.rotate(first))
                .isInstanceOf(UnauthorizedException.class);
        assertThatThrownBy(() -> refreshTokens.rotate(second.refreshToken()))
                .isInstanceOf(UnauthorizedException.class);
    }

    @Test
    @DisplayName("a thief and a victim cannot ping-pong forgiven replays indefinitely")
    void forgivenessIsBoundedPerChain() {
        UUID userId = persistUser();
        String stolen = refreshTokens.issue(userId);

        var thief1 = refreshTokens.rotate(stolen);
        var victim1 = refreshTokens.rotate(stolen);
        var thief2 = refreshTokens.rotate(thief1.refreshToken());
        var victim2 = refreshTokens.rotate(victim1.refreshToken());

        assertThatThrownBy(() -> refreshTokens.rotate(thief2.refreshToken()))
                .isInstanceOf(UnauthorizedException.class);

        assertThatThrownBy(() -> refreshTokens.rotate(victim2.refreshToken()))
                .isInstanceOf(UnauthorizedException.class);
    }

    @Test
    @DisplayName("an uncontested rotation resets the count, so a repeatedly racing client survives")
    void aCleanRotationForgivesThePastRaces() {
        UUID userId = persistUser();
        String live = refreshTokens.issue(userId);

        for (int cycle = 0; cycle < MAX_CONSECUTIVE_GRACES * 2; cycle++) {
            var winner = refreshTokens.rotate(live);
            var loser = refreshTokens.rotate(live);
            assertThat(loser.refreshToken()).isNotIn(live, winner.refreshToken());
            live = refreshTokens.rotate(loser.refreshToken()).refreshToken();
        }

        assertThat(refreshTokens.rotate(live).userId()).isEqualTo(userId);
    }
}

package com.draazy.api.identity.auth;

import com.draazy.api.common.error.UnauthorizedException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StaffInviteService {
    public static final Duration TTL = Duration.ofDays(7);

    private static final String SEPARATOR = ".";

    private final StaffInviteRepository invites;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    public StaffInviteService(StaffInviteRepository invites, UserRepository users,
            PasswordEncoder passwordEncoder) {
        this.invites = invites;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public String issue(UUID userId, UUID createdBy) {
        return issueToken(userId, createdBy, TTL);
    }

    @Transactional
    public String issueToken(UUID userId, UUID createdBy, Duration ttl) {
        String secret = Tokens.randomToken();
        StaffInvite invite = invites.saveAndFlush(new StaffInvite(userId,
                Tokens.sha256Hex(secret), createdBy, Instant.now().plus(ttl)));
        return invite.getId() + SEPARATOR + secret;
    }

    @Transactional
    public String reissue(UUID userId, UUID reissuedBy) {
        return reissueToken(userId, reissuedBy, TTL);
    }

    @Transactional
    public String reissueToken(UUID userId, UUID reissuedBy, Duration ttl) {
        invites.deleteByUserIdAndRedeemedAtIsNull(userId);
        invites.flush();
        return issueToken(userId, reissuedBy, ttl);
    }

    // Every refusal is the same 401 so the route is no oracle; compare the secret in constant
    // time, never with the database's indexed =.
    @Transactional
    public void redeem(String token, String password) {
        StaffInvite invite = openInviteFor(token);
        User user = users.findByIdAndArchivedFalse(invite.getUserId())
                .orElseThrow(StaffInviteService::refuse);
        user.setPasswordHash(passwordEncoder.encode(password));
        invite.redeem();
        invites.save(invite);
    }

    private StaffInvite openInviteFor(String token) {
        int split = token == null ? -1 : token.indexOf(SEPARATOR);
        if (split <= 0 || split == token.length() - 1) {
            throw refuse();
        }
        UUID selector;
        try {
            selector = UUID.fromString(token.substring(0, split));
        } catch (IllegalArgumentException notAUuid) {
            throw refuse();
        }
        StaffInvite invite = invites.findById(selector).orElseThrow(StaffInviteService::refuse);
        String presented = Tokens.sha256Hex(token.substring(split + 1));
        if (!Tokens.hashesEqual(presented, invite.getTokenHash())
                || invite.isRedeemed()
                || invite.isExpired(Instant.now())) {
            throw refuse();
        }
        return invite;
    }

    private static UnauthorizedException refuse() {
        return new UnauthorizedException(
                "This invite link is not valid. Ask an administrator to send you a new one.");
    }
}

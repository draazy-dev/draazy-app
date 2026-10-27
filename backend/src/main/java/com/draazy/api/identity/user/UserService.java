package com.draazy.api.identity.user;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.UnauthorizedException;
import com.draazy.api.security.Roles;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// Every method uses the server-resolved principal id, so callers only touch their own row.
@Service
public class UserService {

    private final UserRepository users;
    private final EntityManager entityManager;
    private final PersonNames personNames;

    public UserService(UserRepository users, EntityManager entityManager, PersonNames personNames) {
        this.users = users;
        this.entityManager = entityManager;
        this.personNames = personNames;
    }

    /** The current user's live profile, or {@code 401} if the account is gone/archived. */
    @Transactional(readOnly = true)
    public User getMe(UUID userId) {
        return liveUser(userId);
    }

    // Server-owned identity/trust fields are not accepted. verifiedContactOnly rationale: UserUpdate.
    @Transactional
    public User updateMe(UUID userId, UserUpdate patch) {
        User user = liveUser(userId);
        if (patch.gender() != null) {
            applyGender(user, patch.gender(), Boolean.TRUE.equals(patch.changeGender()));
            entityManager.refresh(user);
        }
        if (patch.name() != null) {
            if (user.isVerified() && !patch.name().equals(user.getName())) {
                throw new ConflictException(ErrorCodes.NAME_LOCKED_WHILE_VERIFIED,
                        "Verified profiles cannot change name from self-service. Ask support to review it.");
            }
            user.setName(patch.name());
        }
        if (patch.email() != null) {
            if (!patch.email().isBlank()
                    && users.existsOtherLiveWithEmailIgnoreCase(patch.email(), userId)) {
                throw new ConflictException("That email address is already in use");
            }
            user.setEmail(patch.email());
        }
        if (patch.avatar() != null) {
            user.setAvatar(patch.avatar());
        }
        if (patch.city() != null) {
            user.setCity(patch.city());
        }
        if (patch.hideNumber() != null) {
            user.setHideNumber(patch.hideNumber());
        }
        if (patch.verifiedContactOnly() != null) {
            user.setVerifiedContactOnly(patch.verifiedContactOnly());
        }
        if (patch.shareActivityStatus() != null) {
            user.setShareActivityStatus(patch.shareActivityStatus());
        }
        if (patch.shareReadReceipts() != null) {
            user.setShareReadReceipts(patch.shareReadReceipts());
        }
        return user;
    }

    // Without `change` a gender already on file is a 409, so a first-pick prompt can never spend a change.
    private void applyGender(User user, String wanted, boolean change) {
        UUID id = user.getId();
        if (wanted.equals(users.claimGender(id, wanted))) {
            return;
        }
        if (!change) {
            throw new ConflictException("Your gender is already set. Change it from your profile.");
        }
        // The re-read lets an overlapping double-submit of the same change succeed instead of 409ing.
        if (users.changeGender(id, wanted, User.SELF_GENDER_CHANGES) == 0 && !wanted.equals(users.genderOf(id))) {
            throw new ConflictException(user.isVerified()
                    ? "Your gender was confirmed from your ID. Contact support to change it."
                    : "You've used all your gender changes. Contact support to change it.");
        }
    }

    private User liveUser(UUID userId) {
        return users.findById(userId)
                .filter(u -> !u.isArchived())
                .orElseThrow(() -> new UnauthorizedException("Session is no longer valid"));
    }

    // REQUIRES_NEW + eager flush isolates a concurrent first sign-in's UNIQUE violation.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public User provisionBuyer(String mobile) {
        User created = new User(mobile, Roles.Wire.BUYER);
        created.setMobileVerified(true);
        created.setLastActive(Instant.now());
        return users.saveAndFlush(created);
    }

    // An account made on someone's say-so rather than an OTP, so the number stays unverified until they sign in.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public User provisionUnverified(String mobile, String name) {
        User created = new User(mobile, Roles.Wire.BUYER);
        if (name != null && !name.isBlank()) {
            created.setName(personNames.require(name));
        }
        created.setLastActive(Instant.now());
        return users.saveAndFlush(created);
    }
}

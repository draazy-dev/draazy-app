package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** A "women only" or "men only" room or group checks the requester's profile gender, which the first
 * binary answer (an ask or a seeker post) saves; afterwards only the profile's capped changes move it. */
@Component
class FlatmateGenderGate {

    private static final Set<String> BINARY = Set.of("male", "female");

    private final UserRepository users;

    FlatmateGenderGate(UserRepository users) {
        this.users = users;
    }

    void admitToRoom(UUID requesterId, String roomGender, String stated) {
        admit(requesterId, required(roomGender), stated, "room");
    }

    void admitToGroup(UUID requesterId, String policy, String stated) {
        admit(requesterId, required(policy), stated, "group");
    }

    /** A seeker post keeps the answer it was given; a binary one saves to an empty profile and must match a set one. */
    String forPost(User author, String stated) {
        String picked = FlatmateVocabulary.orDefault(
                stated, FlatmateVocabulary.GENDER, "any", "gender");
        if (BINARY.contains(picked) && !picked.equals(resolve(author, picked))) {
            throw new ValidationException("This doesn't match the gender on your profile.");
        }
        return picked;
    }

    void refuseKnownMismatch(UUID userId, String restriction, String what) {
        String required = required(restriction);
        if (required == null) {
            return;
        }
        String known = users.genderOf(userId);
        if (known != null && !known.equals(required)) {
            throw new ValidationException("This " + what + " is open to "
                    + ("female".equals(required) ? "women" : "men") + " only.");
        }
    }

    private static String required(String restriction) {
        return switch (restriction == null ? "" : restriction) {
            case FlatmateVocabulary.POLICY_WOMEN, "female" -> "female";
            case FlatmateVocabulary.POLICY_MEN, "male" -> "male";
            default -> null;
        };
    }

    private String resolve(User user, String stated) {
        if (user.getGender() != null) {
            return user.getGender();
        }
        if (stated != null && BINARY.contains(stated)) {
            return users.claimGender(user.getId(), stated);
        }
        String stored = users.genderOf(user.getId());
        return stored != null ? stored : stated;
    }

    private void admit(UUID requesterId, String required, String stated, String what) {
        if (required == null) {
            return;
        }
        User requester = users.findById(requesterId)
                .orElseThrow(() -> NotFoundException.of("User"));
        String actual = resolve(requester, FlatmateVocabulary.orDefault(
                stated, FlatmateVocabulary.GENDER, null, "gender"));
        String only = "female".equals(required) ? "women" : "men";
        if (actual == null || !BINARY.contains(actual)) {
            throw new ValidationException("This " + what + " is open to " + only
                    + " only. Say whether you are a woman or a man to send your request.");
        }
        if (!actual.equals(required)) {
            throw new ValidationException("This " + what + " is open to " + only
                    + " only, so your request can't be sent.");
        }
    }
}
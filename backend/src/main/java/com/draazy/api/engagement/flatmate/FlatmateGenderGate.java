package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.ValidationException;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Accounts carry no gender, so a "women only" or "men only" room or group asks the requester's own
 * seeker post first and the gender they state on the request second. */
@Component
class FlatmateGenderGate {

    private static final Set<String> BINARY = Set.of("male", "female");

    private final FlatmateSeekerPostRepository posts;

    FlatmateGenderGate(FlatmateSeekerPostRepository posts) {
        this.posts = posts;
    }

    void admitToRoom(UUID requesterId, String roomGender, String stated) {
        admit(requesterId, roomGender, stated, "room");
    }

    void admitToGroup(UUID requesterId, String policy, String stated) {
        String required = switch (policy == null ? "" : policy) {
            case FlatmateVocabulary.POLICY_WOMEN -> "female";
            case FlatmateVocabulary.POLICY_MEN -> "male";
            default -> null;
        };
        admit(requesterId, required, stated, "group");
    }

    private void admit(UUID requesterId, String required, String stated, String what) {
        if (required == null || !BINARY.contains(required)) {
            return;
        }
        String own = FlatmateVocabulary.orDefault(
                stated, FlatmateVocabulary.GENDER, null, "gender");
        String actual = posts.findByUserIdAndArchivedFalse(requesterId)
                .map(FlatmateSeekerPost::getGender)
                .filter(BINARY::contains)
                .orElse(own);
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

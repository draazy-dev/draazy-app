package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.engagement.livingstyle.LivingStyleCatalogue;
import com.draazy.api.engagement.livingstyle.LivingStyleService;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.user.UserStatuses;
import com.draazy.api.security.AuthPrincipal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** An author's living-style answers, under the visibility rule of {@code FlatmateDetailService}.
 * A stranger sees only the keys they answered too. */
@Service
public class FlatmateLivingStyleService {

    public record Response(Map<String, Integer> answers, Integer match, int common) {
    }

    private final FlatmateRoomRepository rooms;
    private final FlatmateGroupRepository groups;
    private final FlatmateSeekerPostRepository posts;
    private final UserRepository users;
    private final LivingStyleService styles;

    FlatmateLivingStyleService(FlatmateRoomRepository rooms, FlatmateGroupRepository groups,
            FlatmateSeekerPostRepository posts, UserRepository users, LivingStyleService styles) {
        this.rooms = rooms;
        this.groups = groups;
        this.posts = posts;
        this.users = users;
        this.styles = styles;
    }

    @Transactional(readOnly = true)
    public Response forItem(AuthPrincipal caller, String kind, UUID id) {
        UUID author = authorOf(caller.userId(), kind, id).orElseThrow(() -> NotFoundException.of("Listing"));
        Map<String, Integer> theirs = LivingStyleCatalogue.ordered(styles.answersOf(author));
        if (author.equals(caller.userId())) {
            return new Response(theirs, null, 0);
        }
        Map<String, Integer> mine = styles.answersOf(caller.userId());
        if (mine.size() < LivingStyleCatalogue.MIN_COMMON) {
            return new Response(Map.of(), null, 0);
        }
        Map<String, Integer> shared = new LinkedHashMap<>(theirs);
        shared.keySet().retainAll(mine.keySet());
        LivingStyleCatalogue.Score score = LivingStyleCatalogue.score(mine, shared);
        return new Response(shared, score.match(), score.common());
    }

    private Optional<UUID> authorOf(UUID callerId, String kind, UUID id) {
        return switch (kind) {
            case "room" -> rooms.findById(id).filter(r -> !r.isArchived())
                    .filter(r -> shown(callerId, r.getHostId(), r.isVisible()))
                    .map(FlatmateRoom::getHostId);
            case "group" -> groups.findById(id).filter(g -> !g.isArchived())
                    .filter(g -> shown(callerId, g.getHostId(), g.isVisible()))
                    .map(FlatmateGroup::getHostId);
            case "post" -> posts.findById(id).filter(p -> !p.isArchived())
                    .filter(p -> shown(callerId, p.getUserId(), p.isVisible()))
                    .map(FlatmateSeekerPost::getUserId);
            default -> Optional.empty();
        };
    }

    private boolean shown(UUID callerId, UUID authorId, boolean visible) {
        return authorId.equals(callerId) || visible && users.findById(authorId)
                .filter(u -> UserStatuses.ACTIVE.equals(u.getStatus()) && !u.isArchived()).isPresent();
    }
}

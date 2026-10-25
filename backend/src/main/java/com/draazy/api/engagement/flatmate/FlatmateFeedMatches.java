package com.draazy.api.engagement.flatmate;

import com.draazy.api.engagement.livingstyle.LivingStyleCatalogue;
import com.draazy.api.engagement.livingstyle.LivingStyleService;
import com.draazy.api.engagement.livingstyle.LivingStyleViewer;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Living-style match per feed row, keyed {@code room:<id>}, {@code group:<id>} or {@code post:<id>}.
 * Only rows whose author has enough answers in common appear, and never the viewer's own. */
@Component
class FlatmateFeedMatches {

    private final LivingStyleService styles;

    FlatmateFeedMatches(LivingStyleService styles) {
        this.styles = styles;
    }

    Map<String, Integer> forWindow(LivingStyleViewer viewer, List<Object> window) {
        if (!viewer.scorable() || window.isEmpty()) {
            return Map.of();
        }
        Map<UUID, Map<String, Integer>> authors = styles.answersOf(window.stream()
                .map(FlatmateFeedMatches::authorOf)
                .filter(id -> id != null && !id.equals(viewer.userId()))
                .collect(Collectors.toSet()));
        Map<String, Integer> out = new HashMap<>();
        for (Object row : window) {
            UUID author = authorOf(row);
            Map<String, Integer> theirs = author == null ? null : authors.get(author);
            if (theirs == null || author.equals(viewer.userId())) {
                continue;
            }
            Integer match = LivingStyleCatalogue.score(viewer.answers(), theirs).match();
            if (match != null) {
                out.put(keyOf(row), match);
            }
        }
        return out;
    }

    static UUID authorOf(Object row) {
        return switch (row) {
            case FlatmateRoom r -> r.getHostId();
            case FlatmateGroup g -> g.getHostId();
            case FlatmateSeekerPost p -> p.getUserId();
            default -> null;
        };
    }

    private static String keyOf(Object row) {
        return switch (row) {
            case FlatmateRoom r -> "room:" + r.getId();
            case FlatmateGroup g -> "group:" + g.getId();
            case FlatmateSeekerPost p -> "post:" + p.getId();
            default -> throw new IllegalStateException("Unmappable feed entry: " + row.getClass());
        };
    }
}

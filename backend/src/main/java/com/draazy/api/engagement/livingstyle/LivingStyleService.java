package com.draazy.api.engagement.livingstyle;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

/** Self-scoped like notification preferences: the caller never names a user id. */
@Service
public class LivingStyleService {

    private final UserLivingStyleRepository rows;
    private final ObjectMapper json;

    public LivingStyleService(UserLivingStyleRepository rows, ObjectMapper json) {
        this.rows = rows;
        this.json = json;
    }

    @Transactional(readOnly = true)
    public LivingStyleDto get(UUID userId) {
        return rows.findById(userId).map(LivingStyleDto::of).orElse(LivingStyleDto.EMPTY);
    }

    /** An empty map deletes the row: "no answers" is stored as absence, never as an empty object. */
    @Transactional
    public LivingStyleDto replace(UUID userId, LivingStyleRequest body) {
        Map<String, Integer> answers = LivingStyleCatalogue.validated(body == null ? null : body.answers());
        if (answers.isEmpty()) {
            rows.deleteById(userId);
            rows.flush();
            return LivingStyleDto.EMPTY;
        }
        rows.upsert(userId, json.writeValueAsString(answers));
        return LivingStyleDto.of(rows.findById(userId).orElseThrow());
    }

    @Transactional(readOnly = true)
    public Map<String, Integer> answersOf(UUID userId) {
        return rows.findById(userId).map(UserLivingStyle::getAnswers).orElse(Map.of());
    }

    /** One query for a whole page of authors; people with no answers are simply absent. */
    @Transactional(readOnly = true)
    public Map<UUID, Map<String, Integer>> answersOf(Collection<UUID> userIds) {
        Map<UUID, Map<String, Integer>> out = new HashMap<>();
        rows.findAllById(userIds).forEach(row -> out.put(row.getUserId(), row.getAnswers()));
        return out;
    }

    /** Guests get {@link LivingStyleViewer#NONE}. */
    @Transactional(readOnly = true)
    public LivingStyleViewer viewer(UUID userId) {
        return userId == null ? LivingStyleViewer.NONE : new LivingStyleViewer(userId, answersOf(userId));
    }
}

package com.draazy.api.content;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.Map;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ContentItem(
        UUID id,
        String type,
        boolean archived,
        String question,
        String answer,
        String category,
        Map<String, Map<String, String>> translations) {
    ContentItem withoutTranslations() {
        return new ContentItem(id, type, archived, question, answer, category, null);
    }

    static ContentItem from(FaqEntity f) {
        return new ContentItem(f.getId(), ContentTypes.FAQS, f.isArchived(), f.getQuestion(), f.getAnswer(),
                f.getCategory(), f.getTranslations());
    }
}
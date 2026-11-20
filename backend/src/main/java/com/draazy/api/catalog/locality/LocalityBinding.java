package com.draazy.api.catalog.locality;

import com.draazy.api.common.error.ValidationException;
import java.util.Collection;
import java.util.List;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
public class LocalityBinding {
    public record Bound(String slug, String name) {
    }

    private final LocalityRepository localities;

    public LocalityBinding(LocalityRepository localities) {
        this.localities = localities;
    }

    @Transactional(readOnly = true)
    public Bound require(String slug, String name) {
        return require(slug, name, null);
    }

    @Transactional(readOnly = true)
    public Bound require(String slug, String name, String existingSlug) {
        if (StringUtils.hasText(slug)) {
            String key = slug.trim();
            return localities.findById(key)
                    .filter(l -> !l.isArchived() || key.equals(existingSlug))
                    .map(l -> new Bound(l.getSlug(), l.getName()))
                    .orElseThrow(LocalityBinding::refusal);
        }
        Locality l = live(name);
        return new Bound(l.getSlug(), l.getName());
    }

    @Transactional(readOnly = true)
    public String canonicalName(String slug, String name) {
        return canonicalName(slug, name, List.of());
    }

    @Transactional(readOnly = true)
    public String canonicalName(String slug, String name, Collection<String> stored) {
        if (!StringUtils.hasText(slug)) {
            return canonicalNames(List.of(name), stored).getFirst();
        }
        return localities.findById(slug.trim())
                .filter(l -> !l.isArchived() || stored.contains(l.getName()))
                .map(Locality::getName)
                .orElseThrow(LocalityBinding::refusal);
    }

    @Transactional(readOnly = true)
    public List<String> canonicalNames(List<String> names) {
        return canonicalNames(names, List.of());
    }

    @Transactional(readOnly = true)
    public List<String> canonicalNames(List<String> names, Collection<String> stored) {
        Collection<String> keep = stored == null ? List.of() : stored;
        return names.stream().map(n -> keep.contains(n) ? n : live(n).getName()).distinct().toList();
    }

    @Transactional(readOnly = true)
    public String slugOrNull(String slug, String name) {
        if (StringUtils.hasText(slug)) {
            return localities.findBySlugAndArchivedAtIsNull(slug.trim()).map(Locality::getSlug).orElse(null);
        }
        if (!StringUtils.hasText(name)) {
            return null;
        }
        List<Locality> hits = localities.findByNameIgnoreCaseAndArchivedAtIsNull(name.trim());
        return hits.size() == 1 ? hits.getFirst().getSlug() : null;
    }

    private Locality live(String name) {
        if (!StringUtils.hasText(name)) {
            throw refusal();
        }
        List<Locality> hits = localities.findByNameIgnoreCaseAndArchivedAtIsNull(name.trim());
        if (hits.size() != 1) {
            throw refusal();
        }
        return hits.getFirst();
    }

    private static ValidationException refusal() {
        return new ValidationException(LocalityPlaceService.PICK_MESSAGE);
    }
}
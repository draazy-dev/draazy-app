package com.draazy.api.catalog.society;

import com.draazy.api.catalog.property.Freshness;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.persistence.LikePatterns;
import com.draazy.api.identity.user.UserStatuses;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.data.jpa.domain.Specification;

public final class SocietySpecs {
    private SocietySpecs() {
    }

    public static Specification<Society> browse(
            String q, String localitySlug, Boolean hasListings, Boolean mapped) {
        return (root, query, cb) -> {
            List<Predicate> where = new ArrayList<>();

            where.add(cb.isNull(root.get("mergedInto")));
            where.add(cb.isNull(root.get("archivedAt")));

            if (likePattern(q) != null) {
                where.add(cb.like(cb.lower(searchText(root, cb)), likePattern(q), '\\'));
            }
            if (trimmed(localitySlug) != null) {
                where.add(cb.equal(root.get("localitySlug"), trimmed(localitySlug)));
            }
            if (Boolean.TRUE.equals(hasListings)) {
                where.add(cb.exists(hasLiveListing(root, query, cb)));
            }
            if (Boolean.TRUE.equals(mapped)) {
                where.add(cb.isNotNull(root.get("placeId")));
            }
            return cb.and(where.toArray(new Predicate[0]));
        };
    }

    public static String likePattern(String q) {
        return LikePatterns.contains(q);
    }

    public static String trimmed(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static Expression<String> searchText(Root<Society> root, CriteriaBuilder cb) {
        Expression<String> locality = cb.function("replace", String.class,
                cb.coalesce(root.<String>get("localitySlug"), ""), cb.literal("-"), cb.literal(" "));
        Expression<String> builder = cb.coalesce(root.<String>get("builder"), "");
        return cb.concat(cb.concat(cb.concat(cb.concat(root.<String>get("name"), " "), builder), " "), locality);
    }

    private static Subquery<Integer> hasLiveListing(
            Root<Society> society, CriteriaQuery<?> query, CriteriaBuilder cb) {
        Subquery<Integer> sub = query.subquery(Integer.class);
        Root<Property> listing = sub.from(Property.class);
        Root<Society> owner = sub.from(Society.class);
        return sub.select(cb.literal(1)).where(
                cb.equal(owner.get("id"), listing.get("societyId")),
                cb.or(
                        cb.equal(owner.get("id"), society.get("id")),
                        cb.equal(owner.get("mergedInto"), society.get("id"))),
                cb.equal(listing.get("status"), PropertyStatus.APPROVED),
                cb.isFalse(listing.get("archived")),
                cb.or(cb.isTrue(listing.get("demo")),
                        cb.greaterThan(cb.coalesce(listing.get("lastConfirmedAt"), listing.get("createdAt")),
                                Freshness.dormantCutoff(Instant.now()))),
                cb.notEqual(listing.get("owner").get("status"), UserStatuses.SUSPENDED));
    }
}
